const { expect } = require('@playwright/test');
const { getLocator, getExpected } = require('./jsonReader');

/**
 * Generic assertions. Elements come from locators.json and
 * expected values come from assertions.json, both by dotted key.
 */
class GenericAssertions {
  constructor(page) {
    this.page = page;
  }

  element(locatorKey) {
    return this.page.locator(getLocator(locatorKey));
  }

  async toBeVisible(locatorKey) {
    await expect(this.element(locatorKey)).toBeVisible();
  }

  async toBeHidden(locatorKey) {
    await expect(this.element(locatorKey)).toBeHidden();
  }

  async toHaveText(locatorKey, expectedKey) {
    await expect(this.element(locatorKey)).toHaveText(getExpected(expectedKey));
  }

  async toContainText(locatorKey, expectedKey) {
    await expect(this.element(locatorKey)).toContainText(getExpected(expectedKey));
  }

  async toHaveValue(locatorKey, value) {
    await expect(this.element(locatorKey)).toHaveValue(value);
  }

  async urlToBe(expectedKey) {
    await expect(this.page).toHaveURL(getExpected(expectedKey));
  }

  async titleToBe(expectedKey) {
    await expect(this.page).toHaveTitle(getExpected(expectedKey));
  }
}

module.exports = { GenericAssertions };
