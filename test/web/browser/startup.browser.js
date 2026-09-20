const { browser, $, expect } = require('@wdio/globals');

describe('production Web startup', () => {
  for (const base of ['/', '/play/']) {
    it(`starts at ${base} without native UI or startup errors`, async () => {
      await browser.url(base);
      await expect($('.web-application')).toHaveAttribute('data-save-policy', 'manual');
      await expect($('.chat-panel')).toExist();
      await expect($('.settings-panel')).toExist();
      await expect($('.game-card-title-control')).toExist();
      await expect($('button[aria-label="切换游戏卡"]')).toBeEnabled();
      const text = await $('body').getText();
      expect(text).not.toMatch(/导入卡片|开发者模式|关闭窗口/);
      expect(await browser.execute(() => window.__startupErrors)).toEqual([]);
      expect(await browser.execute(() => typeof window.__TAURI_INTERNALS__)).toBe('undefined');
    });
  }
});
