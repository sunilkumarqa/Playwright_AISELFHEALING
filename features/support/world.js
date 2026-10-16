const { setWorldConstructor, World, setDefaultTimeout } = require('@cucumber/cucumber');

setDefaultTimeout(30 * 1000);

class CustomWorld extends World {
  constructor(options) {
    super(options);
    this.browser = null;
    this.context = null;
    this.page = null;
    this.actions = null;
    this.verify = null;
  }
}

setWorldConstructor(CustomWorld);
