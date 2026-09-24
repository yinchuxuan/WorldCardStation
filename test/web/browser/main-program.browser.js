/* global before */
const { browser, expect } = require('@wdio/globals');
describe('controlled multi-Agent main.js', () => {
  before(async () => { await browser.url('/integration/'); });
  it('uses a real isolated Worker, runs modules and terminates runaway computation', async () => {
    const result = await browser.execute(() => window.mainProgramHarness());
    expect(result.errorMessage).toBeUndefined();
    expect(result.seen).toEqual(['judge', 'narrator']);
    expect(result.result.state.count).toBe(1);
    expect(result.result.state.globals).toEqual(Array(6).fill('undefined'));
    expect(result.timeout).toContain('timed out');
  });
});
