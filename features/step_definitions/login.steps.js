const { Given, When, Then } = require('@cucumber/cucumber');
const { getTestData } = require('../../src/utils/jsonReader');

Given('I am on the Sauce Demo login page', async function () {
  await this.actions.navigateTo(getTestData('baseUrl'));
  await this.verify.titleToBe('loginPage.pageTitle');
  await this.verify.toHaveText('loginPage.loginLogo', 'loginPage.logoText');
});

When('I log in as {string} user', async function (userType) {
  const { username, password } = getTestData(`users.${userType}`);
  await this.actions.fill('loginPage.usernameInput', username);
  await this.actions.fill('loginPage.passwordInput', password);
  await this.actions.click('loginPage.loginButton');
});

When('I log out', async function () {
  await this.actions.click('inventoryPage.menuButton');
  await this.actions.click('inventoryPage.logoutLink');
});

Then('I should be redirected to the inventory page', async function () {
  await this.verify.urlToBe('inventoryPage.url');
  await this.verify.toBeVisible('inventoryPage.inventoryList');
});

Then('the page header should be {string}', async function (expectedKey) {
  await this.verify.toHaveText('inventoryPage.title', expectedKey);
});

Then('I should see the error message {string}', async function (errorKey) {
  await this.verify.toBeVisible('loginPage.errorMessage');
  await this.verify.toHaveText('loginPage.errorMessage', errorKey);
});

Then('I should remain on the login page', async function () {
  await this.verify.urlToBe('loginPage.url');
  await this.verify.toBeVisible('loginPage.loginButton');
});
