const locators = require('../data/locators.json');
const testData = require('../data/testData.json');
const assertions = require('../data/assertions.json');

/**
 * Resolve a dotted path like "loginPage.usernameInput" inside a JSON object.
 * Throws a clear error if any segment is missing so typos fail fast.
 */
function resolve(source, path, sourceName) {
  const value = path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), source);
  if (value === undefined) {
    throw new Error(`Key "${path}" not found in ${sourceName}`);
  }
  return value;
}

module.exports = {
  getLocator: (path) => resolve(locators, path, 'locators.json'),
  getTestData: (path) => resolve(testData, path, 'testData.json'),
  getExpected: (path) => resolve(assertions, path, 'assertions.json'),
};
