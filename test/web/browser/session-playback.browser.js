const { browser, $, expect } = require('@wdio/globals');
const { configure, selectCard, archive: save } = require('./ui.js');
async function send(value) {
  await $('[data-gc-part="chat-input-trigger"]').moveTo();
  const input = $('[data-gc-part="chat-input-textarea"]');
  await input.waitForDisplayed(); await input.setValue(value);
  await $('[data-gc-part="chat-send-button"]').click();
}
async function gameSnapshot() {
  return browser.execute(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('WorldCardStationWeb');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('sessions');
      const read = tx.objectStore('sessions').getAll();
      read.onsuccess = () => resolve(read.result.find(row => row.reference?.sourceUrl.includes('/reading/'))?.sessions.at(-1));
      tx.oncomplete = () => db.close();
    };
    request.onerror = () => reject(request.error);
  }));
}
describe('saved reading and retry checkpoints', () => {
  it('restores the saved reading page and retry uses the turn base, not the manual save', async () => {
    await browser.url('/reading/');
    await configure('pages'); await selectCard('静态发布测试卡');
    await send('阅读测试');
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第一页的内容'));
    await $('[data-role="assistant"] p').click();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第二页的内容'));
    await save();
    const snapshot = await gameSnapshot();
    expect(snapshot.snapshot.viewState.reading.segmentIndex).toBe(1);
    expect(snapshot.snapshot.retryBaseState.count).toBe(1);
    expect(snapshot.snapshot.gameState.count).toBe(2);
    await browser.refresh();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第二页的内容'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('第一页的内容'));
    // Refresh can leave the pointer over the floating header; move away before hovering the message.
    await $('[data-gc-part="chat-history"]').moveTo();
    await browser.waitUntil(() => browser.execute(() => {
      const header = document.querySelector('.chat-header');
      return header && getComputedStyle(header).visibility === 'hidden';
    }), { timeoutMsg: 'Floating header did not hide before retry' });
    const source = $('[data-role="user"]');
    await source.scrollIntoView({ block: 'center', inline: 'nearest' });
    await source.moveTo();
    const retry = $('button[title="重新生成"]');
    await retry.waitForDisplayed();
    await retry.moveTo();
    await retry.waitForClickable();
    await retry.click();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await expect($('#test-state')).toHaveText('count=2;score=0');
    expect((await gameSnapshot()).revision).toBe(snapshot.revision);
  });
  it('disables save during generation; cancellation can save the incomplete reply once stable', async () => {
    await configure('slow');
    await send('取消生成');
    await $('button[aria-label="停止生成"]').waitForExist();
    await expect($('button[aria-label="管理聊天会话"]')).toBeDisabled();
    await browser.waitUntil(async () => (await $('[data-gc-part="chat-history"]').getText()).includes('你好'));
    await $('[data-gc-part="chat-input-trigger"]').moveTo();
    await $('button[aria-label="停止生成"]').click();
    await save();
    const saved = await gameSnapshot();
    expect(saved.snapshot.messages.some(message => message.role === 'assistant' && message.content.includes('你好'))).toBe(true);
    await browser.refresh();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    expect((await gameSnapshot()).snapshot).toEqual(saved.snapshot);
  });
});
