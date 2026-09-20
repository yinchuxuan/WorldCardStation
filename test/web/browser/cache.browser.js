const { browser, expect } = require('@wdio/globals');

describe('real Cache Storage / IndexedDB resource preparation', () => {
  before(async () => { await browser.url('/integration/');
    await browser.waitUntil(() => browser.execute(() => !!window.cacheHarness)); });
  for (const [method, result] of [['initialize', 'complete'], ['offline', 'offline-ready'],
    ['repair', 'repaired-one'], ['failures', 'failed-safely'],
    ['storageFailure', 'storage-recovered'], ['isolation', 'isolated']]) {
    it(method, async () => {
      expect(await browser.execute(async name => window.cacheHarness[name](), method)).toBe(result);
    });
  }
});
/* eslint-env mocha */
