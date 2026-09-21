const { browser, $, $$, expect } = require('@wdio/globals');

async function openCards() {
  await $('[data-gc-part="chat-header-trigger"]').moveTo();
  await $('button[aria-label="切换游戏卡"]').waitForClickable();
  await $('button[aria-label="切换游戏卡"]').click();
  await $('#game-card-switch-panel[data-state="open"]').waitForDisplayed();
}
async function selectCard(name) {
  await openCards();
  const card = $(`.game-card-switch-row*=${name}`);
  await card.waitForDisplayed();
  await card.click();
  await $('#game-card-switch-panel[data-state="open"]').waitForExist({ reverse: true });
  if (name === '普通聊天') await $('#test-state').waitForExist({ reverse: true });
  else await $('#test-state').waitForExist();
  await $('#game-card-switch-panel[data-state="open"]').waitForExist({ reverse: true });
  await $('button[aria-label="切换游戏卡"]').waitForEnabled();
}
async function openSettings() {
  await $('.settings-trigger-zone').moveTo();
  await $('.settings-panel.visible').waitForDisplayed();
  await browser.waitUntil(() => browser.execute(() =>
    document.querySelector('.settings-panel').getAnimations().every(animation => animation.playState === 'finished')));
  await $('.settings-panel.visible').moveTo();
}
async function editField(field, value) {
  const row = $(`[data-model-field="${field}"]`);
  if (!await row.isExisting()) await $('.model-config-section .config-empty-state').click();
  if (!await row.$('input').isExisting()) await row.$('.settings-field-value').click();
  const input = $(`[data-model-field="${field}"] input`);
  await input.waitForDisplayed();
  await input.click();
  const modifier = await browser.execute(() => /Mac/.test(navigator.platform) ? 'Meta' : 'Control');
  await browser.keys([modifier, 'a']);
  await browser.keys(value || 'Backspace');
  await browser.keys('Enter');
  await input.waitForExist({ reverse: true });
}
async function configure(mode = '') {
  await openSettings();
  const port = new URL(await browser.getUrl()).port;
  await editField('apiUrl', `http://127.0.0.1:${Number(port) + 1}/${mode}`);
  await editField('apiKey', 'test-only-secret');
  await editField('modelName', 'test');
  await expect($('[data-model-field="modelName"] .settings-field-value')).toHaveText('test');
  await browser.action('pointer').move({ x: 100, y: 300 }).perform();
  await browser.waitUntil(() => browser.execute(() => {
    const panel = document.querySelector('.settings-panel');
    return !panel.classList.contains('visible') && panel.getBoundingClientRect().left >= innerWidth;
  }), { timeoutMsg: 'Settings drawer did not close after configuring the model' });
}
async function keyValue() {
  await openSettings();
  const row = $('[data-model-field="apiKey"]');
  await row.$('.settings-field-value').click();
  const value = await row.$('input').getValue();
  await browser.keys('Enter');
  return value;
}
async function openSessions() {
  const error = $('button[aria-label="关闭请求错误"]');
  if (await error.isExisting()) await error.click();
  await $('[data-gc-part="chat-header-trigger"]').moveTo();
  if (!await $('#chat-session-panel[data-state="open"]').isExisting()) {
    await $('button[aria-label="管理聊天会话"]').click();
  }
  await $('#chat-session-panel[data-state="open"]').waitForDisplayed();
}
async function archive() {
  await openSessions();
  const button = $('button[aria-label="保存当前会话"]');
  const count = await $$('.chat-session-row').length;
  await button.waitForClickable(); await button.click();
  await expect($$('.chat-session-row')).toBeElementsArrayOfSize(count + 1);
  await $('button[aria-label="管理聊天会话"]').waitForEnabled();
  await $('button[aria-label="管理聊天会话"]').click();
}
module.exports = { openCards, selectCard, configure, openSettings, keyValue, editField, openSessions, archive };
