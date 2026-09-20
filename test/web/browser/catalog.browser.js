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

  it('downloads through UI, reuses full cache and repairs exactly one missing file', async () => {
    await browser.url('/');
    const download = $('[data-card-id="web-demo"] .card-download button');
    await download.waitForExist();
    await download.click();
    await $('[data-download-phase="ready"]').waitForExist();
    const before = await browser.execute(() => performance.getEntriesByType('resource').length);
    await download.click();
    await $('[data-download-phase="ready"]').waitForExist();
    const reused = await browser.execute(start => performance.getEntriesByType('resource').slice(start)
      .filter(entry => /\/cards\//.test(entry.name)), before);
    expect(reused).toHaveLength(0);
    await browser.execute(async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith('wcs-card-v1-')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (request.url.endsWith('/scripts/helper.js')) await cache.delete(request);
        }
      }
    });
    const repairStart = await browser.execute(() => performance.getEntriesByType('resource').length);
    await download.click();
    await $('[data-download-phase="ready"]').waitForExist();
    const repaired = await browser.execute(start => performance.getEntriesByType('resource').slice(start)
      .filter(entry => /\/cards\//.test(entry.name)).map(entry => entry.name), repairStart);
    expect(repaired).toHaveLength(1);
    expect(repaired[0]).toMatch(/\/scripts\/helper.js$/);
    await browser.refresh();
    await download.waitForExist();
    const refreshStart = await browser.execute(() => performance.getEntriesByType('resource').length);
    await download.click();
    await $('[data-download-phase="ready"]').waitForExist();
    const afterRefresh = await browser.execute(start => performance.getEntriesByType('resource').slice(start)
      .filter(entry => /\/(release|card)\.json$/.test(entry.name)), refreshStart);
    expect(afterRefresh).toHaveLength(0);
  });
});
