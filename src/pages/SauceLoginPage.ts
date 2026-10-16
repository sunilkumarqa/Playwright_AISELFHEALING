import type { Locator } from '@playwright/test';
import locators from '../data/locators.json';
import testData from '../data/testData.json';
import { BasePage } from './BasePage';

/** Page Object for https://www.saucedemo.com, reusing the existing JSON locators and test data. */
export class SauceLoginPage extends BasePage {
  private readonly selectors = locators.loginPage;

  get errorMessage(): Locator {
    return this.page.locator(this.selectors.errorMessage);
  }

  get inventoryTitle(): Locator {
    return this.page.locator(locators.inventoryPage.title);
  }

  async goto(): Promise<void> {
    await this.page.goto(testData.baseUrl);
  }

  async login(username: string, password: string): Promise<void> {
    await this.healer.fill(this.selectors.usernameInput, username, { description: 'Username input on the Swag Labs login form' });
    await this.healer.fill(this.selectors.passwordInput, password, { description: 'Password input on the Swag Labs login form' });
    await this.healer.click(this.selectors.loginButton, { description: 'Login button on the Swag Labs login form' });
  }
}
