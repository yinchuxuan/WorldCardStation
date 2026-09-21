/* global before */
const { browser, expect } = require('@wdio/globals');
describe('real Web runtime boundaries', () => {
  before(async () => { await browser.url('/integration/'); });
  for (const protocol of ['openai', 'anthropic']) {
    it(`${protocol} uses real cross-origin preflight and split SSE`, async () => {
      const result = await browser.execute(protocol => window.runtimeHarness.model(protocol), protocol);
      expect(result.content).toContain('你好，旅人。'); expect(result.errorMessage).toBeUndefined();
    });
  }
  it('reports denied CORS and provider HTTP errors', async () => {
    expect((await browser.execute(() => window.runtimeHarness.model('openai', 'deny'))).errorMessage).toContain('网络或跨域');
    expect((await browser.execute(() => window.runtimeHarness.model('openai', 'http-error'))).errorMessage).toContain('测试限流');
  });
  it('runs actual Worker and terminates an infinite loop', async () => {
    const result = await browser.execute(() => window.runtimeHarness.worker());
    expect(result.result).toEqual({ messages: [], state: { count: 3 } });
    expect(result.timeout).toContain('timed out');
  });
  it('times out and cancels a real in-flight stream', async () => {
    const result = await browser.execute(() => window.runtimeHarness.networkLifecycle());
    expect(result.timeout).toContain('超时'); expect(result.canceled).toBe('AbortError');
  });
  it('persists and clears keys by default and restores local background Blobs', async () => {
    const result = await browser.execute(() => window.runtimeHarness.settings());
    expect(result.persisted).toMatchObject({ apiKey: 'persisted', modelName: 'test' });
    expect(result.removed.apiKey).toBe(''); expect(result.readable).toBe(true); expect(result.revoked).toBe(true);
  });
  it('matches the desktop/Node pipeline for init and two complete rule/patch turns', async () => {
    const { actual, expected } = await browser.execute(() => window.runtimeHarness.parity());
    expect(actual).toEqual(expected);
    expect(actual.at(-1).state.count).toBe(3);
    expect(actual.at(-1).state.score).toBe(7);
  });
});
