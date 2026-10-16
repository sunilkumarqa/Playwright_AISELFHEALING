import { errors, type Locator, type Page, type TestInfo } from '@playwright/test';
import { collectCandidates } from './candidateCollector';
import { buildAndValidate } from './locatorBuilder';
import type { HealingProvider } from './providers/HealingProvider';
import { HealingReporter } from './HealingReporter';
import { sanitizeUrl, summarizeError } from './sanitize';
import { HealingDecisionSchema, type HealingDecision } from './schema';
import type { HealingAction, HealingConfig, HealingEvent, HealingStatus, ValidationResult } from './types';

export type HealingTarget = string | Locator;

export interface HealingActionOptions {
  /** Plain-language description of the intended element, e.g. "Username input on the login form". */
  description: string;
  /** Overrides config.actionTimeoutMs for this action. */
  timeout?: number;
}

/** Thrown when an eligible failure could not be healed. Wraps and preserves the original Playwright error. */
export class SelfHealingFailedError extends Error {
  constructor(
    readonly originalError: Error,
    readonly healingStatus: HealingStatus,
    readonly healingReason: string,
  ) {
    super(`${originalError.message}\n\n[self-healing] Not healed (${healingStatus}): ${healingReason}`, { cause: originalError });
    this.name = originalError.name;
    const originalFrames = originalError.stack?.split('\n').filter((line) => line.trimStart().startsWith('at ')) ?? [];
    this.stack = [`${this.name}: ${this.message}`, ...originalFrames].join('\n');
  }
}

type Perform = (locator: Locator, timeout: number | undefined) => Promise<void>;

interface Eligibility {
  eligible: boolean;
  reason: string;
}

export class SelfHealingAgent {
  private readonly reporter: HealingReporter;

  constructor(
    private readonly page: Page,
    private readonly config: HealingConfig,
    private readonly provider: HealingProvider | null,
    private readonly testInfo?: TestInfo,
  ) {
    this.reporter = new HealingReporter(config, testInfo);
  }

  get events(): readonly HealingEvent[] {
    return this.reporter.events;
  }

  // ---- Public wrappers used by Page Objects -------------------------------------------------

  click(target: HealingTarget, options: HealingActionOptions): Promise<void> {
    return this.run('click', target, options, (l, timeout) => l.click({ timeout }));
  }

  dblclick(target: HealingTarget, options: HealingActionOptions): Promise<void> {
    return this.run('dblclick', target, options, (l, timeout) => l.dblclick({ timeout }));
  }

  /** The value is passed straight to Playwright and is never logged, reported or sent to the AI. */
  fill(target: HealingTarget, value: string, options: HealingActionOptions): Promise<void> {
    return this.run('fill', target, options, (l, timeout) => l.fill(value, { timeout }));
  }

  check(target: HealingTarget, options: HealingActionOptions): Promise<void> {
    return this.run('check', target, options, (l, timeout) => l.check({ timeout }));
  }

  uncheck(target: HealingTarget, options: HealingActionOptions): Promise<void> {
    return this.run('uncheck', target, options, (l, timeout) => l.uncheck({ timeout }));
  }

  selectOption(target: HealingTarget, values: string | string[], options: HealingActionOptions): Promise<void> {
    return this.run('selectOption', target, options, async (l, timeout) => {
      await l.selectOption(values, { timeout });
    });
  }

  hover(target: HealingTarget, options: HealingActionOptions): Promise<void> {
    return this.run('hover', target, options, (l, timeout) => l.hover({ timeout }));
  }

  press(target: HealingTarget, key: string, options: HealingActionOptions): Promise<void> {
    return this.run('press', target, options, (l, timeout) => l.press(key, { timeout }));
  }

  /** Attach the report to the Playwright test and write proposed locator changes for review. */
  async finalize(): Promise<void> {
    await this.reporter.flush();
  }

  // ---- Core flow ----------------------------------------------------------------------------

  private async run(action: HealingAction, target: HealingTarget, options: HealingActionOptions, perform: Perform): Promise<void> {
    const locator = typeof target === 'string' ? this.page.locator(target) : target;
    const originalLocator = typeof target === 'string' ? target : target.toString();
    // With healing disabled, behave exactly like plain Playwright (default timeouts included).
    const timeout = this.config.enabled ? (options.timeout ?? this.config.actionTimeoutMs) : options.timeout;

    try {
      await perform(locator, timeout);
      return;
    } catch (caught) {
      if (!this.config.enabled) throw caught;
      const originalError = caught instanceof Error ? caught : new Error(String(caught));

      const eligibility = await this.classify(originalError, locator);
      const base = this.baseEvent(action, options.description, originalLocator, originalError);
      if (!eligibility.eligible) {
        this.reporter.record({ ...base, status: 'not-eligible', reason: eligibility.reason });
        throw originalError;
      }
      await this.heal(action, options, base, originalError, perform, timeout);
    }
  }

  /** Only "the locator matches nothing" is healable. Everything else is a real failure. */
  private async classify(error: Error, locator: Locator): Promise<Eligibility> {
    if (this.page.isClosed()) return { eligible: false, reason: 'Page was closed' };
    if (!(error instanceof errors.TimeoutError)) {
      return { eligible: false, reason: `Not a locator timeout (${error.name}); treated as a genuine failure` };
    }
    try {
      const count = await locator.count();
      if (count === 0) return { eligible: true, reason: 'Original locator matched no elements' };
      return {
        eligible: false,
        reason: `Original locator still matches ${count} element(s); element exists but was not actionable (application state, not a locator change)`,
      };
    } catch (countError) {
      return { eligible: false, reason: `Could not inspect original locator: ${summarizeError(countError)}` };
    }
  }

  private async heal(
    action: HealingAction,
    options: HealingActionOptions,
    base: Omit<HealingEvent, 'status' | 'reason'>,
    originalError: Error,
    perform: Perform,
    timeout: number | undefined,
  ): Promise<void> {
    const fail = (status: HealingStatus, reason: string, extra: Partial<HealingEvent> = {}): never => {
      this.reporter.record({ ...base, ...extra, status, reason });
      throw new SelfHealingFailedError(originalError, status, reason);
    };

    if (!this.provider) {
      fail('provider-unavailable', 'No AI provider configured (set OPENAI_API_KEY and AI_HEALING_MODEL)');
    }
    const provider = this.provider as HealingProvider;

    const candidates = await collectCandidates(this.page, action, this.config.maxCandidates);
    if (candidates.length === 0) fail('rejected', 'No visible candidate elements suitable for this action');

    await this.reporter.screenshot(this.page, 'before');

    let decision: HealingDecision;
    try {
      const raw = await this.withTimeout((signal) =>
        provider.selectCandidate(
          {
            action,
            intendedElement: options.description,
            originalLocator: base.originalLocator,
            failureReason: 'Original locator matched no elements',
            candidates,
          },
          signal,
        ),
      );
      const parsed = HealingDecisionSchema.safeParse(raw);
      if (!parsed.success) {
        return fail('invalid-response', `AI response failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`, { provider: provider.name });
      }
      decision = parsed.data;
    } catch (error) {
      if (error instanceof SelfHealingFailedError) throw error;
      return fail('provider-error', `AI provider call failed: ${summarizeError(error)}`, { provider: provider.name });
    }

    const decided = {
      provider: provider.name,
      confidence: decision.confidence,
      recommendedLocatorDescription: decision.recommendedLocatorDescription,
    };
    if (!decision.shouldHeal || !decision.selectedCandidateId) {
      fail('rejected', `AI declined to heal: ${decision.reasoning}`, decided);
    }
    if (decision.confidence < this.config.minConfidence) {
      fail('rejected', `Confidence ${decision.confidence} is below threshold ${this.config.minConfidence}`, decided);
    }
    const candidate = candidates.find((c) => c.id === decision.selectedCandidateId);
    if (!candidate) fail('rejected', `AI selected unknown candidate id "${decision.selectedCandidateId}"`, decided);

    const { built, validation } = await buildAndValidate(this.page, candidate!, action);
    const validated = { ...decided, validation, replacementLocator: built?.expression ?? null };
    if (!built || !validation.passed) fail('rejected', validation.message, validated);

    try {
      await perform(built!.locator, timeout);
    } catch (retryError) {
      fail('retry-failed', `Retry with replacement locator failed: ${summarizeError(retryError)}`, validated);
    }

    await this.reporter.screenshot(this.page, 'after');
    this.reporter.record({ ...base, ...validated, status: 'healed', reason: decision.reasoning });
  }

  private async withTimeout<T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`AI call exceeded ${this.config.aiTimeoutMs}ms`));
      }, this.config.aiTimeoutMs);
    });
    try {
      return await Promise.race([call(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private baseEvent(action: HealingAction, description: string, originalLocator: string, error: Error): Omit<HealingEvent, 'status' | 'reason'> {
    return {
      testName: this.testInfo ? this.testInfo.titlePath.join(' > ') : 'unknown',
      timestamp: new Date().toISOString(),
      pageUrl: sanitizeUrl(this.page.url()),
      action,
      intendedElement: description,
      originalLocator,
      originalError: summarizeError(error),
      replacementLocator: null,
      recommendedLocatorDescription: null,
      confidence: null,
      validation: null,
      provider: null,
    };
  }
}

export type { ValidationResult };
