const { getLocator } = require('./jsonReader');

/**
 * Generic, page-agnostic browser actions.
 * Every element is referenced by its key in locators.json (e.g. "loginPage.loginButton").
 */
class GenericActions {
  constructor(page) {
    this.page = page;
  }

  element(locatorKey) {
    return this.page.locator(getLocator(locatorKey));
  }

  async navigateTo(url) {
    await this.page.goto(url);
  }

  async click(locatorKey) {
    await this.element(locatorKey).click();
  }

  async fill(locatorKey, value) {
    await this.element(locatorKey).fill(value);
  }

  async clear(locatorKey) {
    await this.element(locatorKey).clear();
  }

  async getText(locatorKey) {
    return (await this.element(locatorKey).textContent())?.trim();
  }

  async waitForVisible(locatorKey, timeout = 10000) {
    await this.element(locatorKey).waitFor({ state: 'visible', timeout });
  }

  async pressKey(locatorKey, key) {
    await this.element(locatorKey).press(key);
  }
}

module.exports = { GenericActions };
