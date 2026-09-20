const { browser, expect } = require('@wdio/globals');
describe('real storage lifecycle isolation and coordination', () => {
  before(async () => {
    await browser.url('/integration/');
    await browser.waitUntil(() => browser.execute(() => !!window.resourceLifecycleHarness));
  });
  for (const [method, result] of [['isolation', 'isolated'], ['races', 'race-safe']]) {
    it(method, async () => {
      expect(await browser.execute(async name => window.resourceLifecycleHarness[name](), method)).toBe(result);
    });
  }
});
/* eslint-env mocha */
