const { browser, $, expect } = require('@wdio/globals');

describe('real browser platform module integration', () => {
  it('selects Web contracts and rejects unavailable services', async () => {
    await browser.url('/integration/');
    await browser.waitUntil(async () => (await $('#result').getText()) !== 'pending');
    const result = JSON.parse(await $('#result').getText());
    expect(result.savePolicy).toBe('manual');
    expect(result.capabilities).toMatchObject({ gameplay: true, fullscreen: true, nativeClose: false, diskTrace: false });
    expect(result.errors).toEqual(Array(5).fill('PLATFORM_UNAVAILABLE'));
    expect(await browser.execute(() => window.__startupErrors)).toEqual([]);
  });
});
