import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import type { HealingConfig, HealingEvent } from './types';

/**
 * Collects healing events for one test, attaches them to the Playwright HTML report and
 * writes proposed locator changes to disk for human review. Never touches source files.
 */
export class HealingReporter {
  readonly events: HealingEvent[] = [];

  constructor(
    private readonly config: HealingConfig,
    private readonly testInfo?: TestInfo,
  ) {}

  record(event: HealingEvent): void {
    this.events.push(event);
    const replacement = event.replacementLocator ? ` -> ${event.replacementLocator}` : '';
    console.warn(`[self-healing] ${event.status}: ${event.originalLocator}${replacement} (${event.reason})`);
  }

  /** Masked screenshot: every input, textarea, select and editable region is blacked out. */
  async screenshot(page: Page, label: 'before' | 'after'): Promise<void> {
    if (!this.config.screenshots || !this.testInfo || page.isClosed()) return;
    try {
      const body = await page.screenshot({
        mask: [page.locator('input, textarea, select, [contenteditable]')],
        maskColor: '#000000',
      });
      await this.testInfo.attach(`self-healing-${label}-${this.events.length + 1}.png`, { body, contentType: 'image/png' });
    } catch {
      // Screenshots are best effort and must never change the test outcome.
    }
  }

  async flush(): Promise<void> {
    if (this.events.length === 0 || !this.testInfo) return;

    const report = {
      testName: this.testInfo.titlePath.join(' > '),
      project: this.testInfo.project.name,
      retry: this.testInfo.retry,
      generatedAt: new Date().toISOString(),
      events: this.events,
      proposedLocatorChanges: this.events
        .filter((e) => e.status === 'healed')
        .map((e) => ({
          intendedElement: e.intendedElement,
          originalLocator: e.originalLocator,
          proposedLocator: e.replacementLocator,
          confidence: e.confidence,
          pageUrl: e.pageUrl,
          reviewNote: 'Proposed by AI self-healing. Verify and update the Page Object manually; nothing was changed in source code.',
        })),
    };
    const body = JSON.stringify(report, null, 2);

    await this.testInfo.attach('self-healing-report.json', { body, contentType: 'application/json' });

    const dir = path.resolve(this.config.reportDir);
    await mkdir(dir, { recursive: true });
    const slug = `${this.testInfo.project.name}-${this.testInfo.testId}-retry${this.testInfo.retry}`.replace(/[^\w.-]+/g, '_');
    await writeFile(path.join(dir, `${slug}.json`), body);
  }
}
