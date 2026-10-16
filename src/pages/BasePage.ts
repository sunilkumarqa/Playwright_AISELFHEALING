import type { Page } from '@playwright/test';
import type { SelfHealingAgent } from '../healing/SelfHealingAgent';

/** Page Objects route interactions through the agent; assertions stay plain Playwright `expect`. */
export abstract class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly healer: SelfHealingAgent,
  ) {}
}
