const { browser, $, expect } = require('@wdio/globals');

const { configure, selectCard, keyValue, editField } = require('./ui.js');

async function send(content) {
  await $('[data-gc-part="chat-input-trigger"]').moveTo();
  const input = $('[data-gc-part="chat-input-textarea"]');
  await input.waitForDisplayed();
  await input.moveTo();
  await input.setValue(content);
  await $('[data-gc-part="chat-send-button"]').click();
}
describe('production Web playable loop', () => {
  it('downloads, initializes Worker, emits state events and plays two model turns', async () => {
    await browser.url('/');
    await configure();
    await selectCard('静态发布测试卡');
    await expect($('#test-state')).toHaveText('count=1;score=0');
    await $('#test-increment').click();
    await expect($('#test-state')).toHaveText('count=2;score=0');
    await $('#test-script').click();
    await expect($('#test-state')).toHaveText('count=1;score=0');
    const background = await $('.app-background-layer-current').getCSSProperty('background-image');
    await send('第一轮');
    await expect($('#test-state')).toHaveText('count=2;score=7');
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('新的旅程开始了'));
    await browser.waitUntil(async () => (await $('.app-background-layer-current').getCSSProperty('background-image')).value !== background.value);
    await browser.waitUntil(() => browser.execute(() => {
      const portraits = [...document.querySelectorAll('[data-gc-part="portrait-layer"] img')];
      return portraits.some(image => image.complete && image.naturalWidth > 0);
    }));
    await browser.waitUntil(() => browser.execute(() => document.querySelector('audio')?.readyState >= 2));
    await $('[data-gc-part="chat-header-trigger"]').moveTo();
    const bgm = $('[data-gc-part="bgm-button"]');
    // Respect browser autoplay blocking; a player gesture must unlock playback.
    if ((await bgm.getAttribute('title')).includes('手动')) await bgm.click();
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('audio').paused));
    await send('第二轮');
    await expect($('#test-state')).toHaveText('count=3;score=7');
    expect(await browser.execute(() => window.__startupErrors)).toEqual([]);
    expect(await $('body').getText()).not.toMatch(/开发者模式|导入卡片|已保存/);
  });
  it('provider error is visible and retry completes the same turn', async () => {
    await configure('http-error');
    await send('失败后重试');
    await expect($('body')).toHaveText(expect.stringContaining('测试限流'));
    await configure();
    const retry = $('button[title="重新生成"]');
    await $('[data-role="user"]').moveTo();
    await retry.moveTo();
    await retry.waitForClickable();
    await retry.click();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('新的旅程开始了'));
  });
  it('key survives refresh by default and clearing the field persists', async () => {
    await browser.refresh();
    expect(await keyValue()).toBe('test-only-secret');
    await expect($('.settings-panel')).not.toHaveText(expect.stringContaining('记住密钥'));
    await expect($('.settings-panel')).not.toHaveText(expect.stringContaining('切换全屏'));
    await editField('apiKey', '');
    await expect($('[data-model-field="apiKey"] .settings-field-value')).toHaveText('未设置');
    await browser.refresh();
    expect(await keyValue()).toBe('');
  });
});
