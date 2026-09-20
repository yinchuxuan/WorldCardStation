const { browser, $, $$, expect } = require('@wdio/globals');
const { openCards, selectCard, openSessions, archive } = require('./ui.js');
let otherTab;

async function data(store) {
  return browser.execute(name => new Promise((resolve, reject) => {
    const request = indexedDB.open('WorldCardStationWeb');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(name), get = tx.objectStore(name).getAll();
      let result; get.onsuccess = () => { result = get.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  }), store);
}
async function removeCard(confirm = true) {
  await openCards();
  const warning = await confirmClick($('button[aria-label="卸载 静态发布测试卡"]'), confirm);
  expect(warning).toContain('存档会保留');
}
async function confirmClick(button, accept = true) {
  if (!browser.isBidi) {
    await button.click();
    const message = await browser.getAlertText();
    if (accept) await browser.acceptAlert(); else await browser.dismissAlert();
    return message;
  }
  // Register before clicking: WebdriverIO otherwise automatically dismisses native dialogs.
  const answer = new Promise((resolve, reject) => {
    const handler = async dialog => {
      try {
        const message = dialog.message();
        if (accept) await dialog.accept(); else await dialog.dismiss();
        resolve(message);
      } catch (error) { reject(error); }
      finally { browser.off('dialog', handler); }
    };
    browser.on('dialog', handler);
  });
  await button.click();
  return answer;
}
describe('resource removal and session deletion', () => {
  it('cancel is harmless; unload exits both tabs, preserves saves, and re-download restores them', async () => {
    await browser.url('/'); await selectCard('静态发布测试卡');
    await $('#test-increment').click(); await expect($('#test-state')).toHaveText('count=2;score=0');
    await $('[data-gc-part="chat-input-trigger"]').moveTo();
    await $('[data-gc-part="chat-input-textarea"]').waitForDisplayed();
    await $('[data-gc-part="chat-input-textarea"]').setValue('卸载后仍保留的消息');
    await $('[data-gc-part="chat-send-button"]').click();
    await archive();
    const before = await data('sessions');
    const first = await browser.getWindowHandle();
    await browser.newWindow(await browser.getUrl());
    // A new independent tab may not inherit sessionStorage.
    if (!await $('#test-state').isExisting()) await selectCard('静态发布测试卡');
    await $('#test-state').waitForExist();
    const second = await browser.getWindowHandle();
    otherTab = second;
    await browser.switchToWindow(first);
    await removeCard(false);
    await expect($('#test-state')).toHaveText('count=2;score=0');
    await $('button[aria-label="切换游戏卡"]').click();
    await removeCard();
    await $('#test-state').waitForExist({ reverse: true });
    await browser.waitUntil(async () => (await browser.execute(() => caches.keys())).length === 0);
    expect(await data('sessions')).toEqual(before);
    await browser.switchToWindow(second);
    await $('#test-state').waitForExist({ reverse: true });
    await $('[data-gc-part="chat-header-trigger"]').moveTo();
    await expect($('.game-card-title-name')).toHaveText('普通聊天');
    await browser.switchToWindow(first);
    await selectCard('静态发布测试卡');
    // Non-empty history restores saved state without rerunning the fixture's init reset.
    await expect($('#test-state')).toHaveText('count=2;score=0');
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('卸载后仍保留的消息'));
    expect(await data('sessions')).toEqual(before);
    await openSessions(); await expect($$('.chat-session-row')).toBeElementsArrayOfSize(2);
    await $('button[aria-label="管理聊天会话"]').click();
    const cached = await browser.execute(() => caches.keys());
    await selectCard('普通聊天');
    expect(await browser.execute(() => caches.keys())).toEqual(cached);
    await selectCard('静态发布测试卡');
  });
  it('deleting sessions preserves resources and other saves, last deletion exits without recreating a session', async () => {
    const first = await browser.getWindowHandle();
    await browser.switchToWindow(otherTab);
    await selectCard('静态发布测试卡');
    await openSessions(); await $('.chat-session-row*=默认会话').click();
    await browser.switchToWindow(first);
    const cached = await browser.execute(() => caches.keys());
    const records = await data('sessions'), game = records.find(record => record.key !== 'no-card');
    await openSessions();
    await confirmClick($('.chat-session-row:not(.active) button[aria-label="删除会话"]'), false);
    await expect($$('.chat-session-row')).toBeElementsArrayOfSize(2);
    await confirmClick($('.chat-session-row:not(.active) button[aria-label="删除会话"]'));
    await expect($$('.chat-session-row')).toBeElementsArrayOfSize(1);
    await expect($('#test-state')).toHaveText('count=2;score=0');
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('卸载后仍保留的消息'));
    expect(await browser.execute(() => caches.keys())).toEqual(cached);
    await browser.switchToWindow(otherTab);
    await openSessions(); await $('button[aria-label="保存当前会话"]').click();
    await expect($('.session-save-control [role="alert"]')).toHaveText(expect.stringContaining('会话已被删除'));
    expect((await data('sessions')).find(record => record.key === game.key).sessions).toHaveLength(1);
    await browser.switchToWindow(first);
    await confirmClick($('.chat-session-row.active button[aria-label="删除会话"]'));
    await $('#test-state').waitForExist({ reverse: true });
    await $('[data-gc-part="chat-header-trigger"]').moveTo();
    await expect($('.game-card-title-name')).toHaveText('普通聊天');
    expect((await data('sessions')).find(record => record.key === game.key).sessions).toEqual([]);
    expect(await browser.execute(() => caches.keys())).toEqual(cached);
    await browser.refresh();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    expect((await data('sessions')).find(record => record.key === game.key).sessions).toEqual([]);
  });
});
