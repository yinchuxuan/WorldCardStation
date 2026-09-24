const { browser, $, expect } = require('@wdio/globals');
const { configure, openCards, archive } = require('./ui.js');

async function send(text) {
  await $('[data-gc-part="chat-input-trigger"]').moveTo();
  const input = $('[data-gc-part="chat-input-textarea"]');
  await input.waitForDisplayed(); await input.setValue(text);
  await $('[data-gc-part="chat-send-button"]').click();
  await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('实际展示'));
  await $('button[aria-label="管理聊天会话"]').waitForEnabled();
}
async function history() {
  await $('[data-gc-part="chat-header-trigger"]').moveTo();
  await $('.chat-header').click();
  await $('[aria-label="Agent 消息历史"]').waitForExist();
}
describe('published multi-Agent card in the production player', () => {
  it('starts from initialized Messages without model input and restores an explicitly saved opening', async () => {
    await browser.url('/runtime/');
    await openCards();
    await $('.game-card-switch-row*=Startup Fixture').click();
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup first 1'));
    await expect($('[data-gc-part="chat-input-textarea"]')).toBeEnabled();
    await expect($('[aria-label="停止运行"]')).not.toExist();
    await expect($('[aria-label="管理聊天会话"]')).toBeDisabled();
    await $('.segmented-reading-page').click();
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup second'));
    await $('.segmented-reading-page').click();
    await $('[aria-label="管理聊天会话"]').waitForEnabled();
    await archive();
    await browser.refresh();
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup second'));
    await expect($('[data-gc-part="chat-send-button"]')).toHaveAttribute('aria-label', '发送消息');
  });
  it('downloads dependencies, plays, archives, reloads and continues independent histories', async () => {
    await browser.url('/runtime/');
    await configure('multi-agent');
    await openCards();
    await $('.game-card-switch-row*=Judge 与 Narrator').click();
    await $('button[aria-label="切换游戏卡"]').waitForEnabled();
    await send('第一轮');
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('最终历史'));
    await archive();
    await browser.refresh();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('实际展示'));
    await send('第二轮');
    await history();
    await $('button[aria-label="下一个 Agent"]').click();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('最终历史'));
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('第二轮'));
    await $('button[aria-label="上一个 Agent"]').click();
    await expect($('[data-gc-part="chat-history"]')).toHaveText(expect.stringContaining('verdict'));
    await expect($('[data-gc-part="chat-history"]')).not.toHaveText(expect.stringContaining('最终历史'));
    expect(await browser.execute(() => window.__startupErrors)).toEqual([]);
  });
});
