const { refreshApp } = require('../tauri-e2e/support/tauri');

describe('E2E refresh synchronization', () => {
  const originalBrowser = global.browser;
  const originalSelector = global.$;

  afterEach(() => {
    global.browser = originalBrowser;
    global.$ = originalSelector;
    document.documentElement.removeAttribute('data-e2e-refresh-pending');
    document.body.innerHTML = '';
  });

  test('rejects the old app shell and waits for the new document without script polling', async () => {
    document.body.innerHTML = '<div class="app-container"></div>';
    const calls = [];
    global.browser = {
      tauri: { switchWindow: jest.fn(async () => { calls.push('window'); }) },
      execute: jest.fn(async callback => { calls.push('mark'); return callback(); }),
      refresh: jest.fn(async () => {
        calls.push('refresh');
        expect(document.documentElement.hasAttribute('data-e2e-refresh-pending')).toBe(true);
      })
    };
    global.$ = jest.fn(selector => ({ waitForExist: jest.fn(async () => {
      calls.push('lookup');
      expect(document.querySelector(selector)).toBeNull();
      document.documentElement.removeAttribute('data-e2e-refresh-pending');
      document.body.innerHTML = '';
      expect(document.querySelector(selector)).toBeNull();
      document.body.innerHTML = '<div class="app-container"></div>';
      expect(document.querySelector(selector)).not.toBeNull();
    }) }));

    await refreshApp();

    expect(calls).toEqual(['window', 'mark', 'refresh', 'lookup']);
    expect(global.browser.tauri.switchWindow).toHaveBeenCalledWith('main');
    expect(global.browser.execute).toHaveBeenCalledTimes(1);
    expect(global.$).toHaveBeenCalledWith('html:not([data-e2e-refresh-pending]) .app-container');
  });

  test('does not hide refresh failures', async () => {
    global.browser = { tauri: { switchWindow: jest.fn() }, execute: jest.fn(),
      refresh: jest.fn().mockRejectedValue(new Error('reload failed')) };
    global.$ = jest.fn();
    await expect(refreshApp()).rejects.toThrow('reload failed');
    expect(global.$).not.toHaveBeenCalled();
  });
});
