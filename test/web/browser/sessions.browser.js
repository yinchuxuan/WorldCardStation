const { browser, $, expect } = require('@wdio/globals');
const { openCards, archive: save } = require('./ui.js');
const { openTab } = require('./window.js');

async function send(content) {
  await $('[data-gc-part="chat-input-trigger"]').moveTo();
  const input = $('[data-gc-part="chat-input-textarea"]');
  await input.waitForDisplayed(); await input.setValue(content);
  await $('[data-gc-part="chat-send-button"]').click();
  await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining(content));
}
async function snapshot() {
  return browser.execute(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('WorldCardStationWeb');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('sessions');
      const read = tx.objectStore('sessions').get('no-card');
      read.onsuccess = () => resolve(read.result.sessions.at(-1));
      tx.oncomplete = () => db.close();
    };
    request.onerror = () => reject(request.error);
  }));
}
describe('explicit browser sessions', () => {
  it('never autosaves, saves complete progress and restores only the saved snapshot', async () => {
    await browser.url('/');
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await expect($('button[aria-label="保存进度"]')).not.toExist();
    await send('已存消息');
    expect((await snapshot()).snapshot.messages).toEqual([]);
    await save();
    expect((await snapshot()).snapshot.messages[0].content).toBe('已存消息');
    await send('未存消息');
    expect((await snapshot()).snapshot.messages).toHaveLength(1);
    await browser.refresh();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('已存消息'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('未存消息'));
  });
  it('switches cards directly without a prompt or implicitly saving changes', async () => {
    await send('切换前的修改');
    await openCards(); await $('.game-card-switch-row*=静态发布测试卡').click();
    await $('#test-state').waitForExist();
    await expect($('[aria-label="未保存的进度"]')).not.toExist();
    expect((await snapshot()).snapshot.messages).toHaveLength(1);
    await $('#test-increment').click();
    await openCards(); await $('.game-card-switch-row*=普通聊天').click();
    await $('#test-state').waitForExist({ reverse: true });
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('已存消息'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('切换前的修改'));
  });
  it('two tabs create separate archives without overwriting each other', async () => {
    const first = await browser.getWindowHandle();
    const second = await openTab();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await browser.switchToWindow(first);
    await send('标签一的存档'); await save();
    const firstArchive = await snapshot();
    await browser.switchToWindow(second);
    await send('标签二的旧副本');
    await save();
    const secondArchive = await snapshot();
    expect(secondArchive.id).not.toBe(firstArchive.id);
    expect(secondArchive.snapshot.messages.at(-1).content).toBe('标签二的旧副本');
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('标签二的旧副本'));
    await browser.switchToWindow(first);
    await browser.refresh();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('标签一的存档'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('标签二的旧副本'));
  });
});
