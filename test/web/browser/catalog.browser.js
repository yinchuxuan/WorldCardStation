const { browser, $, expect } = require('@wdio/globals');

describe('published game catalog', () => {
  for (const base of ['/', '/play/']) {
    it(`shows real published metadata at ${base} without downloading the game`, async () => {
      await browser.url(base);
      const card = $('[data-card-id="web-demo"]');
      await expect(card.$('h3')).toHaveText('静态发布测试卡');
      await expect(card).toHaveText(expect.stringContaining('版本 1.0'));
      await browser.waitUntil(() => browser.execute(() => {
        const image = document.querySelector('[data-card-id="web-demo"] img');
        return image?.complete && image.naturalWidth > 0;
      }));
      const paths = await browser.execute(() => performance.getEntriesByType('resource')
        .map(entry => new URL(entry.name).pathname).filter(path => path.includes('/cards/')));
      expect(paths).toHaveLength(2);
      expect(paths).toContain(`${base}cards/index.json`);
      expect(paths.some(path => /\/sha256-[a-f0-9]{64}\/preview\/cover.png$/.test(path))).toBe(true);
      expect(paths.some(path => /\/(release|card).json$/.test(path))).toBe(false);
      await expect(card.$('button')).toBeDisabled();
      expect(await browser.execute(() => window.__startupErrors)).toEqual([]);
    });
  }
});
