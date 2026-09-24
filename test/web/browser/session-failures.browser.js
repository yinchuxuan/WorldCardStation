const { browser, $, expect } = require('@wdio/globals');
const { openSessions: sessions, archive: save, configure } = require('./ui.js');
async function send(text) {
  await $('[data-gc-part="chat-input-trigger"]').moveTo();
  await $('[data-gc-part="chat-input-textarea"]').waitForDisplayed();
  await $('[data-gc-part="chat-input-textarea"]').setValue(text);
  await $('[data-gc-part="chat-send-button"]').click();
  await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining(text));
  await $('button[aria-label="管理聊天会话"]').waitForEnabled();
}
describe('session management and failure safety', () => {
  it('explicit save failure preserves memory progress and the previous snapshot', async () => {
    await browser.url('/'); await configure(); await send('旧存档'); await save();
    await sessions();
    await $('.chat-session-row.active button[aria-label="重命名会话"]').click();
    await $('.chat-session-title-input').setValue('旧存档');
    await $('button[aria-label="保存会话名"]').click();
    await $('button[aria-label="管理聊天会话"]').click();
    await send('配额不足时的现场');
    await browser.execute(() => {
      window.__originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'sessions') throw new DOMException('测试：空间不足', 'QuotaExceededError');
        return window.__originalPut.apply(this, args);
      };
    });
    await sessions(); await $('button[aria-label="保存当前会话"]').click();
    await expect($('.session-save-control [role="alert"]')).toHaveText(expect.stringContaining('空间不足'));
    await expect($('#test-state')).not.toExist();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('配额不足时的现场'));
    await browser.execute(() => { IDBObjectStore.prototype.put = window.__originalPut; });
    await browser.refresh();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('旧存档'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('配额不足时的现场'));
  });
  it('creates and switches independent sessions through the shared manager', async () => {
    await sessions(); await $('button[aria-label="新建会话"]').click();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('旧存档'));
    await send('第二个会话'); await save();
    if (!await $('#chat-session-panel[data-state="open"]').isExisting()) await sessions();
    await $('.chat-session-row*=旧存档').click();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('旧存档'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('第二个会话'));
  });
  it('a corrupt saved snapshot disables writing and does not overwrite the existing record', async () => {
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    const original = await browser.execute(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('WorldCardStationWeb');
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('sessions', 'readwrite'), store = tx.objectStore('sessions');
        tx.onabort = () => { db.close(); reject(tx.error?.message || 'Session transaction aborted'); };
        const get = store.get('no-card'); let original;
        get.onsuccess = () => {
          // Runtime snapshots share message objects. Pass JSON across WebDriver,
          // not a graph of repeated remote object references.
          original = JSON.stringify(get.result);
          const corrupt = get.result; corrupt.sessions[1].snapshot.messages = 'damaged'; store.put(corrupt);
        };
        tx.oncomplete = () => { db.close(); resolve(original); };
      };
    }));
    await browser.refresh();
    await expect($('body')).toHaveText(expect.stringContaining('会话快照已损坏'));
    await sessions();
    await expect($('button[aria-label="保存当前会话"]')).toBeDisabled();
    const preserved = await browser.execute(original => new Promise((resolve, reject) => {
      const open = indexedDB.open('WorldCardStationWeb');
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('sessions', 'readwrite'), store = tx.objectStore('sessions');
        tx.onabort = () => { db.close(); reject(tx.error?.message || 'Session transaction aborted'); };
        const get = store.get('no-card'); let corrupted;
        get.onsuccess = () => { corrupted = get.result.sessions[1].snapshot.messages; store.put(JSON.parse(original)); };
        tx.oncomplete = () => { db.close(); resolve(corrupted); };
      };
    }), original);
    expect(preserved).toBe('damaged');
    await browser.refresh();
    await $('button[aria-label="管理聊天会话"]').waitForEnabled();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('旧存档'));
  });
});
