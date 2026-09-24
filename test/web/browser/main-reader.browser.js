/* global before, after */
const { browser, expect } = require('@wdio/globals');
describe('main reader → existing presentation (real SSE and media)', () => {
  before(async () => { await browser.url('/integration/'); await browser.execute(() => window.mainReaderHarness.init()); });
  after(async () => { await browser.execute(() => window.mainReaderHarness.dispose()); });
  it('hides auxiliary messages and defers media changes until reading advances', async () => {
    await browser.$('button=Start reader').click();
    await browser.waitUntil(async () => (await browser.$('[data-gc-part="message-surface"]').getText()).includes('第一段。'));
    const first = await browser.execute(() => window.mainReaderHarness.view());
    expect(first.state.visual.scene).toBe('room');
    expect(first.records[0].content).not.toContain('辅助裁定');
    await browser.$('button=Next reader').click();
    await browser.waitUntil(async () => (await browser.$('[data-gc-part="message-surface"]').getText()).includes('第二段。'));
    await browser.waitUntil(() => browser.execute(() => [...document.querySelectorAll('#reader-harness img')].length === 2
      && [...document.querySelectorAll('#reader-harness img')].every(image => image.complete && image.naturalWidth > 0)));
    await browser.waitUntil(() => browser.execute(() => document.querySelector('#reader-harness audio')?.readyState >= 2));
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('#reader-harness audio').paused
      || Boolean(document.querySelector('#reader-harness .game-card-bgm-btn.blocked'))));
    const play = await browser.$('#reader-harness .game-card-bgm-btn.blocked');
    if (await play.isExisting()) await play.click();
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('#reader-harness audio').paused));
    const second = await browser.execute(() => window.mainReaderHarness.view());
    expect(second.state.visual.scene).toBe('outside');
    expect(second.state.visual.portraits).toEqual({ guide: 'smile' });
    expect(second.state.audio.bgm).toBe('theme');
    await browser.$('button=narrator').click();
    expect(await browser.$('[data-gc-part="message-history"]').getText()).toContain('state_patch_stream');
    await browser.$('button=Next reader').click();
    await browser.waitUntil(() => browser.execute(() => Boolean(window.mainReaderHarness.result())));
    expect((await browser.execute(() => window.mainReaderHarness.result())).errorMessage).toBeUndefined();
    await browser.$('button=Previous reader').click();
    expect((await browser.execute(() => window.mainReaderHarness.snapshot())).state).toEqual(second.state);
  });
  it('IndexedDB archive survives page restart without replaying reader or losing Agent history', async () => {
    const before = await browser.execute(() => window.mainReaderHarness.snapshot());
    await browser.execute(() => window.mainReaderHarness.save());
    await browser.refresh();
    await browser.execute(() => window.mainReaderHarness.init(true));
    await browser.waitUntil(async () => (await browser.$('[data-gc-part="message-surface"]').getText()).includes('第一段。'));
    expect(await browser.execute(() => window.mainReaderHarness.snapshot())).toEqual(before);
    await browser.waitUntil(() => browser.execute(() => document.querySelectorAll('#reader-harness img').length === 2
      && [...document.querySelectorAll('#reader-harness img')].every(img => img.complete && img.naturalWidth > 0)));
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('#reader-harness audio').paused
      || Boolean(document.querySelector('#reader-harness .game-card-bgm-btn.blocked'))));
    const play = await browser.$('#reader-harness .game-card-bgm-btn.blocked');
    if (await play.isExisting()) await play.click();
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('#reader-harness audio').paused));
    await browser.$('button=narrator').click();
    expect(await browser.$('[data-gc-part="message-history"]').getText()).toContain('state_patch_stream');
    await browser.$('button=Next reader').click();
    expect((await browser.execute(() => window.mainReaderHarness.snapshot())).state).toEqual(before.state);
    await browser.$('button=Start reader').click();
    await browser.waitUntil(() => browser.execute(() => Boolean(window.mainReaderHarness.view().reading)));
    await browser.$('button=Next reader').click();
    await browser.waitUntil(() => browser.execute(() => window.mainReaderHarness.view().reading
      && window.mainReaderHarness.view().records.at(-1)?.content.includes('第二段。')));
    await browser.$('button=Next reader').click();
    await browser.waitUntil(() => browser.execute(() => Boolean(window.mainReaderHarness.result())));
    const after = await browser.execute(() => window.mainReaderHarness.snapshot());
    expect(after.contexts.narrator.messages.length).toBe(before.contexts.narrator.messages.length + 1);
    expect(after.records.length).toBe(before.records.length + 1);
  });
  it('failure after visible reading restores the entire baseline and media', async () => {
    await browser.execute(() => window.mainReaderHarness.init());
    await browser.$('button=Fail reader').click();
    await browser.waitUntil(() => browser.execute(() => Boolean(window.mainReaderHarness.view().reading)));
    await browser.$('button=Next reader').click();
    await browser.waitUntil(() => browser.execute(() => window.mainReaderHarness.view().reading
      && window.mainReaderHarness.view().records[0]?.content.includes('第二段。')));
    await browser.$('button=Next reader').click();
    await browser.waitUntil(() => browser.execute(() => Boolean(window.mainReaderHarness.result())));
    const result = await browser.execute(() => window.mainReaderHarness.result());
    expect(result.errorMessage).toContain('reader rollback');
    expect((await browser.execute(() => window.mainReaderHarness.snapshot())).records).toEqual([]);
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('#reader-harness img')
      && document.querySelector('#reader-harness audio').paused));
  });
});
