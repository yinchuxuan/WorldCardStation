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
      const emblem = await browser.execute(() => {
        const element = document.querySelector('.chat-header-emblem');
        const style = getComputedStyle(element);
        return { width: style.width, height: style.height, icon: element.textContent.trim(),
          gap: getComputedStyle(element.parentElement).gap };
      });
      expect(emblem).toEqual({ width: '44px', height: '44px', icon: 'square', gap: '4px' });
      await expect($('.runtime-trace-toggle')).not.toExist();
      await $('[data-gc-part="chat-header-trigger"]').moveTo();
      await expect($('[data-gc-part="model-status"]')).toHaveText('模型未配置');
      expect(await browser.execute(() => {
        const title = document.querySelector('.game-card-title-main').getBoundingClientRect();
        const model = document.querySelector('[data-gc-part="model-status"]');
        const style = getComputedStyle(model);
        return { gap: Math.round(model.getBoundingClientRect().left - title.right),
          size: style.fontSize, background: style.backgroundColor !== 'rgba(0, 0, 0, 0)' };
      })).toEqual({ gap: 12, size: '12px', background: true });
      await $('button[aria-label="切换游戏卡"]').click();
      await browser.waitUntil(() => browser.execute(() => getComputedStyle(
        document.querySelector('[data-gc-part="game-card-title-icon"]')).transform === 'matrix(0, 1, -1, 0, 0, 0)'));
      await $('button[aria-label="切换游戏卡"]').click();
      await browser.waitUntil(() => browser.execute(() => getComputedStyle(
        document.querySelector('[data-gc-part="game-card-title-icon"]')).transform === 'none'));
      const text = await $('body').getText();
      expect(text).not.toMatch(/导入卡片|开发者模式|关闭窗口/);
      expect(await browser.execute(() => window.__startupErrors)).toEqual([]);
      expect(await browser.execute(() => typeof window.__TAURI_INTERNALS__)).toBe('undefined');
    });
  }
  it('keeps the configured model badge beside the card name with full-opacity styling', async () => {
    await configure();
    await $('[data-gc-part="chat-header-trigger"]').moveTo();
    await expect($('[data-gc-part="model-status"]')).toHaveText('test');
    expect(await browser.execute(() => {
      const title = document.querySelector('.game-card-title-main').getBoundingClientRect();
      const badge = document.querySelector('[data-gc-part="model-status"]');
      const model = badge.getBoundingClientRect();
      const actions = document.querySelector('.game-card-title-actions').getBoundingClientRect();
      return Math.round(model.left - title.right) === 12 && model.right <= actions.left
        && getComputedStyle(badge).opacity === '1'
        && getComputedStyle(badge, '::before').width === '6px';
    })).toBe(true);
  });
});
