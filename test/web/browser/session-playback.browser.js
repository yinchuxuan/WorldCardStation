const { browser, $, expect } = require('@wdio/globals');
const { configure, selectCard, archive: save } = require('./ui.js');
const { retryTurn } = require('./retry.js');
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
describe('saved reading and whole-turn retry', () => {
  it('restores the saved reading page and retry uses the turn base, not the manual save', async () => {
    await browser.url('/reading/');
    await configure('pages'); await selectCard('静态发布测试卡');
    await send('阅读测试');
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第一页的内容'));
    await expect($('button[aria-label="管理聊天会话"]')).toBeDisabled();
    await $('[data-role="assistant"] p').click();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第二页的内容'));
    await $('[data-role="assistant"] p').click();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await save();
    const snapshot = await gameSnapshot();
    expect(snapshot.snapshot.runtimeSession.viewState.reading.segmentIndex).toBe(1);
    expect(snapshot.snapshot.runtimeSession.retryBase.snapshot.state.count).toBe(1);
    expect(snapshot.snapshot.gameState.count).toBe(2);
    await browser.refresh();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第二页的内容'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('第一页的内容'));
    await retryTurn();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第一页的内容'));
    await $('[data-role="assistant"] p').click();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第二页的内容'));
    await $('[data-role="assistant"] p').click();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await expect($('#test-state')).toHaveText('count=2;score=0');
    expect((await gameSnapshot()).revision).toBe(snapshot.revision);
  });
  it('disables save during generation; refresh discards the unfinished turn and restores the explicit save', async () => {
    await save();
    const before = await gameSnapshot();
    await configure('slow');
    await send('刷新中断生成');
    await expect($('button[aria-label="管理聊天会话"]')).toBeDisabled();
    await expect($('#test-state')).toHaveText('count=3;score=0');
    expect(await gameSnapshot()).toEqual(before);
    await browser.refresh();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await expect($('#test-state')).toHaveText('count=2;score=0');
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第二页的内容'));
    expect(await gameSnapshot()).toEqual(before);
  });
});
