import { test, expect } from './fixtures/healing.fixture';
import { SauceLoginPage } from '../src/pages/SauceLoginPage';
import testData from '../src/data/testData.json';

// Uses the env-configured agent: with AI_HEALING_ENABLED unset this is plain Playwright.
test.describe('Sauce Demo login (Page Object + self-healing agent)', () => {
  test('standard user can log in', async ({ page, healingAgent }) => {
    const login = new SauceLoginPage(page, healingAgent);
    await login.goto();
    await login.login(testData.users.standard.username, testData.users.standard.password);
    await expect(login.inventoryTitle).toHaveText('Products');
  });

  test('locked out user sees an error', async ({ page, healingAgent }) => {
    const login = new SauceLoginPage(page, healingAgent);
    await login.goto();
    await login.login(testData.users.locked.username, testData.users.locked.password);
    await expect(login.errorMessage).toContainText('locked out');
  });
});
