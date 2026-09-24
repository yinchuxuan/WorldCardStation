const { browser, $, expect } = require('@wdio/globals');
const { configure } = require('./ui.js');

describe('production Web startup', () => {
  for (const base of ['/', '/play/']) {
    it(`starts at ${base} without native UI or startup errors`, async () => {
      await browser.url(base);
      await expect($('.web-application')).toHaveAttribute('data-save-policy', 'manual');
      await expect($('.chat-panel')).toExist();
      await expect($('.settings-panel')).toExist();
      await expect($('.game-card-title-control')).toExist();
      await expect($('button[aria-label="切换游戏卡"]')).toBeEnabled();
      await expect($('.runtime-trace-toggle')).not.toExist();
      await $('[data-gc-part="chat-header-trigger"]').moveTo();
      await expect($('[data-gc-part="model-status"]')).toHaveText('模型未配置');
      expect(await browser.execute(() => {
        const title = document.querySelector('.game-card-title-main').getBoundingClientRect();
        const model = document.querySelector('[data-gc-part="model-status"]');
        const badge = model.getBoundingClientRect();
        const actions = document.querySelector('.game-card-title-actions').getBoundingClientRect();
        return badge.left > title.right && badge.right <= actions.left && badge.width > 0;
      })).toBe(true);
      const initialTransform = await browser.execute(() => getComputedStyle(
        document.querySelector('[data-gc-part="game-card-title-icon"]')).transform);
      await $('button[aria-label="切换游戏卡"]').click();
      await $('#game-card-switch-panel[data-state="open"]').waitForDisplayed();
      await browser.waitUntil(() => browser.execute(initial => getComputedStyle(
        document.querySelector('[data-gc-part="game-card-title-icon"]')).transform !== initial, initialTransform));
      await $('button[aria-label="切换游戏卡"]').click();
      await $('#game-card-switch-panel[data-state="open"]').waitForExist({ reverse: true });
      await browser.waitUntil(() => browser.execute(initial => getComputedStyle(
        document.querySelector('[data-gc-part="game-card-title-icon"]')).transform === initial, initialTransform));
      const text = await $('body').getText();
      expect(text).not.toMatch(/导入卡片|开发者模式|关闭窗口/);
      expect(await browser.execute(() => window.__startupErrors)).toEqual([]);
      expect(await browser.execute(() => typeof window.__TAURI_INTERNALS__)).toBe('undefined');
    });
  }
  it('keeps the configured model visible between the card name and action controls', async () => {
    await configure();
    await $('[data-gc-part="chat-header-trigger"]').moveTo();
    await expect($('[data-gc-part="model-status"]')).toHaveText('test');
    await expect($('[data-gc-part="model-status"]')).toBeDisplayed();
    expect(await browser.execute(() => {
      const title = document.querySelector('.game-card-title-main').getBoundingClientRect();
      const badge = document.querySelector('[data-gc-part="model-status"]');
      const model = badge.getBoundingClientRect();
      const actions = document.querySelector('.game-card-title-actions').getBoundingClientRect();
      return model.left > title.right && model.right <= actions.left;
    })).toBe(true);
  });
});
