import type { Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export const DEMO_URL = 'http://self-healing.demo/login';

/** Page Object for the local demo login page (tests/fixtures/demoApp.ts). */
export class DemoLoginPage extends BasePage {
  // Locators as originally written. The "changed" demo variant breaks #username on purpose.
  static readonly selectors = {
    username: '#username',
    password: '#password',
    rememberMe: '#remember-me',
    role: '#role',
    submit: '#login-button',
  } as const;

  get welcome(): Locator {
    return this.page.locator('#welcome');
  }

  get errorMessage(): Locator {
    return this.page.locator('#error');
  }

  async goto(): Promise<void> {
    await this.page.goto(DEMO_URL);
  }

  async enterUsername(username: string): Promise<void> {
    await this.healer.fill(DemoLoginPage.selectors.username, username, { description: 'Username text input on the login form' });
  }

  /** Password is passed only to Playwright's fill(); the agent never logs or transmits values. */
  async enterPassword(password: string): Promise<void> {
    await this.healer.fill(DemoLoginPage.selectors.password, password, { description: 'Password input on the login form' });
  }

  async rememberMe(): Promise<void> {
    await this.healer.check(DemoLoginPage.selectors.rememberMe, { description: '"Remember me" checkbox' });
  }

  async chooseRole(role: string): Promise<void> {
    await this.healer.selectOption(DemoLoginPage.selectors.role, role, { description: 'Role dropdown on the login form' });
  }

  async submit(): Promise<void> {
    await this.healer.click(DemoLoginPage.selectors.submit, { description: 'Sign in submit button' });
  }

  async login(username: string, password: string): Promise<void> {
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.submit();
  }
}
