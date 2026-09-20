const { browser, expect } = require('@wdio/globals');
describe('real IndexedDB session transactions', () => {
  it('concurrent archives append independently and preserve their source', async () => {
    await browser.url('/integration/');
    await browser.waitUntil(() => browser.execute(() => Boolean(window.sessionHarness)));
    const result = await browser.execute(() => window.sessionHarness.archives());
    expect(result.count).toBe(3);
    expect(result.original.messages).toEqual([]);
    expect(result.first.messages).toEqual([{ content: 'first' }]);
    expect(result.second.messages).toEqual([{ content: 'second' }]);
    expect(result.first.saveTarget.id).not.toBe(result.second.saveTarget.id);
  });
  it('atomically saves full snapshots, rejects stale/deleted targets and isolates source/release/no-card', async () => {
    await browser.url('/integration/');
    await browser.waitUntil(() => browser.execute(() => Boolean(window.sessionHarness)));
    const result = await browser.execute(() => window.sessionHarness.transactions());
    expect(result.conflict).toBe('SESSION_CONFLICT');
    expect(result.deleted).toBe('SESSION_CONFLICT');
    expect(result.aborted).toBe(true);
    expect(result.afterAbort).toEqual(result.snapshot);
    expect(result.snapshot).toMatchObject({ messages: [{ id: 'm', content: 'after' }], gameState: { score: 7 },
      viewState: { reading: { messageId: 'm', segmentIndex: 2 } }, retryBaseState: { score: 1 },
      retryBaseMessages: [{ content: 'before' }] });
    expect(result.isolated).toEqual([0, 0, 0]);
    expect(result.ordinary.messages).toEqual([]);
    expect(result.remaining.sessions).toEqual([]);
  });
});
