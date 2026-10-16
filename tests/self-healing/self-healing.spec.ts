import { test, expect } from '../fixtures/healing.fixture';
import { DEMO_CREDENTIALS, serveDemo } from '../fixtures/demoApp';
import { DemoLoginPage } from '../../src/pages/DemoLoginPage';
import { MockHealingProvider } from '../../src/healing/providers/MockHealingProvider';
import { createHealingProviderFromEnv } from '../../src/healing/providers/OpenAIHealingProvider';
import { SelfHealingFailedError } from '../../src/healing/SelfHealingAgent';
import { HealingDecisionSchema } from '../../src/healing/schema';
import { loadHealingConfig } from '../../src/healing/config';
import { sanitizeText, sanitizeUrl } from '../../src/healing/sanitize';
import type { DomCandidate, HealingConfig, HealingRequest } from '../../src/healing/types';

const ENABLED: Partial<HealingConfig> = { enabled: true, minConfidence: 0.9, actionTimeoutMs: 1_500, aiTimeoutMs: 2_000 };

function decide(pick: (c: DomCandidate) => boolean, confidence = 0.97) {
  return (request: HealingRequest) => {
    const match = request.candidates.find(pick);
    return {
      selectedCandidateId: match?.id ?? null,
      confidence,
      reasoning: match ? `Candidate ${match.id} matches "${request.intendedElement}"` : 'No match',
      recommendedLocatorDescription: match ? `${match.tag} ${match.accessibleName ?? ''}`.trim() : '',
      shouldHeal: Boolean(match),
    };
  };
}

const neverCalled = () => {
  throw new Error('AI provider must not be called in this scenario');
};

async function captureError(action: Promise<unknown>): Promise<Error> {
  try {
    await action;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the action to fail, but it succeeded');
}

test.describe('Self-healing agent', () => {
  test('unchanged locators run without calling the AI', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'original');
    const mock = new MockHealingProvider(neverCalled);
    const agent = createHealingAgent({ provider: mock, config: ENABLED });
    const login = new DemoLoginPage(page, agent);

    await login.goto();
    await login.rememberMe();
    await login.chooseRole('admin');
    await login.login(DEMO_CREDENTIALS.username, DEMO_CREDENTIALS.password);

    await expect(login.welcome).toHaveText(`Welcome, ${DEMO_CREDENTIALS.username}`);
    expect(mock.callCount).toBe(0);
    expect(agent.events).toHaveLength(0);
  });

  test('changed locator is healed using a mocked AI response', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'changed-username');
    const mock = new MockHealingProvider(decide((c) => c.testId === 'login-user'));
    const agent = createHealingAgent({ provider: mock, config: ENABLED });
    const login = new DemoLoginPage(page, agent);

    await login.goto();
    await login.login(DEMO_CREDENTIALS.username, DEMO_CREDENTIALS.password);

    await expect(login.welcome).toHaveText(`Welcome, ${DEMO_CREDENTIALS.username}`);
    expect(mock.callCount).toBe(1);

    const [event] = agent.events;
    expect(event).toMatchObject({
      status: 'healed',
      action: 'fill',
      originalLocator: '#username',
      replacementLocator: 'page.getByTestId("login-user")',
      confidence: 0.97,
      validation: { passed: true },
    });

    // Nothing typed into the form (including the password) is ever sent to the provider.
    const sent = JSON.stringify(mock.requests);
    expect(sent).not.toContain(DEMO_CREDENTIALS.password);
    expect(sent).not.toContain(DEMO_CREDENTIALS.username);
    expect(sent).not.toMatch(/<\w+[\s>]/); // no raw HTML
    expect(mock.requests[0].candidates.find((c) => c.type === 'password')).toBeDefined();
  });

  test('ambiguous candidate is rejected and the original error is preserved', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'ambiguous-submit');
    const mock = new MockHealingProvider(decide((c) => c.accessibleName === 'Sign in'));
    const login = new DemoLoginPage(page, createHealingAgent({ provider: mock, config: ENABLED }));

    await login.goto();
    await login.enterUsername(DEMO_CREDENTIALS.username);
    await login.enterPassword(DEMO_CREDENTIALS.password);
    const error = await captureError(login.submit());

    expect(error).toBeInstanceOf(SelfHealingFailedError);
    const healingError = error as SelfHealingFailedError;
    expect(healingError.healingStatus).toBe('rejected');
    expect(healingError.message).toContain('not uniquely identifiable');
    expect(healingError.originalError.name).toBe('TimeoutError');
    expect(healingError.message).toContain(healingError.originalError.message);
    await expect(login.welcome).toBeHidden();
  });

  test('low-confidence AI response is rejected', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'changed-username');
    const mock = new MockHealingProvider(decide((c) => c.testId === 'login-user', 0.55));
    const agent = createHealingAgent({ provider: mock, config: ENABLED });
    const login = new DemoLoginPage(page, agent);

    await login.goto();
    const error = await captureError(login.enterUsername(DEMO_CREDENTIALS.username));

    expect((error as SelfHealingFailedError).healingStatus).toBe('rejected');
    expect(error.message).toContain('Confidence 0.55 is below threshold 0.9');
    expect(agent.events[0]).toMatchObject({ status: 'rejected', confidence: 0.55, replacementLocator: null });
  });

  test('invalid AI response fails safely', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'changed-username');
    const mock = new MockHealingProvider(() => ({ selectedCandidateId: 'c1', confidence: 7, selector: '#evil' }));
    const login = new DemoLoginPage(page, createHealingAgent({ provider: mock, config: ENABLED }));

    await login.goto();
    const error = await captureError(login.enterUsername(DEMO_CREDENTIALS.username));

    expect((error as SelfHealingFailedError).healingStatus).toBe('invalid-response');
    expect((error as SelfHealingFailedError).originalError.name).toBe('TimeoutError');
  });

  test('AI unavailability fails safely', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'changed-username');

    // 1) Provider throws (network outage, 5xx, timeout...)
    const failing = new MockHealingProvider(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const login = new DemoLoginPage(page, createHealingAgent({ provider: failing, config: ENABLED }));
    await login.goto();
    const providerError = await captureError(login.enterUsername(DEMO_CREDENTIALS.username));
    expect((providerError as SelfHealingFailedError).healingStatus).toBe('provider-error');
    expect(providerError.message).toContain('ECONNREFUSED');
    expect(failing.callCount).toBe(1); // exactly one AI call per failed action

    // 2) No API key configured at all
    expect(createHealingProviderFromEnv({ ...loadHealingConfig({}), model: 'any' }, {})).toBeNull();
    const noProvider = new DemoLoginPage(page, createHealingAgent({ provider: null, config: ENABLED }));
    const missingError = await captureError(noProvider.enterUsername(DEMO_CREDENTIALS.username));
    expect((missingError as SelfHealingFailedError).healingStatus).toBe('provider-unavailable');
    expect(missingError.message).toContain('OPENAI_API_KEY');
  });

  test('genuine assertion failure is not healed', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'original');
    const mock = new MockHealingProvider(neverCalled);
    const agent = createHealingAgent({ provider: mock, config: ENABLED });
    const login = new DemoLoginPage(page, agent);

    await login.goto();
    await login.login(DEMO_CREDENTIALS.username, 'wrong-password');

    await expect(expect(login.welcome).toBeVisible({ timeout: 1_000 })).rejects.toThrow();
    await expect(login.errorMessage).toHaveText('Invalid username or password');
    expect(mock.callCount).toBe(0);
    expect(agent.events).toHaveLength(0);
  });

  test('real application failure is not hidden', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'disabled-submit');
    const mock = new MockHealingProvider(neverCalled);
    const agent = createHealingAgent({ provider: mock, config: ENABLED });
    const login = new DemoLoginPage(page, agent);

    await login.goto();
    await login.enterUsername(DEMO_CREDENTIALS.username);
    await login.enterPassword(DEMO_CREDENTIALS.password);
    const error = await captureError(login.submit());

    expect(error).not.toBeInstanceOf(SelfHealingFailedError); // raw Playwright error, untouched
    expect(error.name).toBe('TimeoutError');
    expect(mock.callCount).toBe(0);
    expect(agent.events[0]).toMatchObject({ status: 'not-eligible' });
    expect(agent.events[0].reason).toContain('element exists but was not actionable');
  });

  test('healing disabled (default) behaves like plain Playwright', async ({ page, createHealingAgent }) => {
    await serveDemo(page, 'changed-username');
    const mock = new MockHealingProvider(neverCalled);
    const agent = createHealingAgent({ provider: mock, config: { enabled: false } });
    const login = new DemoLoginPage(page, agent);

    await login.goto();
    const error = await captureError(agent.fill('#username', 'x', { description: 'Username', timeout: 1_000 }));

    expect(error).not.toBeInstanceOf(SelfHealingFailedError);
    expect(error.name).toBe('TimeoutError');
    expect(mock.callCount).toBe(0);
    expect(agent.events).toHaveLength(0);
  });
});

test.describe('Self-healing building blocks', () => {
  test('config defaults are safe', () => {
    const config = loadHealingConfig({});
    expect(config.enabled).toBe(false);
    expect(config.minConfidence).toBe(0.9);
  });

  test('schema rejects malformed or extra fields', () => {
    const valid = { selectedCandidateId: 'c1', confidence: 0.95, reasoning: 'r', recommendedLocatorDescription: 'd', shouldHeal: true };
    expect(HealingDecisionSchema.safeParse(valid).success).toBe(true);
    expect(HealingDecisionSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
    expect(HealingDecisionSchema.safeParse({ ...valid, selector: 'body' }).success).toBe(false);
  });

  test('sanitizers strip sensitive data', () => {
    expect(sanitizeText('Contact jane.doe@example.com now')).toBe('Contact [email] now');
    expect(sanitizeText('Card 4111 1111 1111 1111')).toBe('Card [number]');
    expect(sanitizeUrl('https://u:p@app.test/login?token=abc&page=2#frag')).toBe('https://app.test/login?token=REDACTED&page=2');
  });
});
