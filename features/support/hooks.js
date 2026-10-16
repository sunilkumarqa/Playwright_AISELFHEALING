const { Before, After, Status } = require('@cucumber/cucumber');
const { chromium } = require('@playwright/test');
const { GenericActions } = require('../../src/utils/genericActions');
const { GenericAssertions } = require('../../src/utils/genericAssertions');

Before(async function () {
  this.browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
  this.context = await this.browser.newContext();
  this.page = await this.context.newPage();
  this.actions = new GenericActions(this.page);
  this.verify = new GenericAssertions(this.page);
});

After(async function ({ result }) {
  if (result?.status === Status.FAILED && this.page) {
    const screenshot = await this.page.screenshot({ fullPage: true });
    this.attach(screenshot, 'image/png');
  }
  await this.browser?.close();
});
