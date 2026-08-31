/* global browser, $, $$, before, after */

const { StreamServer } = require('./support/streamServer');
const {
  invoke, refreshApp, resetNoCard
} = require('./support/tauri');

describe('Tauri startup and settings', () => {
  let server;

  before(async () => {
    server = await new StreamServer().start();
  });

  after(async () => server.close());

  beforeEach(async () => {
    await resetNoCard();
  });

  it('should launch and display main window', async () => {
    expect(await browser.getTitle()).toBe('世界站 · World Card Station');
    await expect($('.app-container')).toExist();
    await expect($('.chat-panel')).toExist();
    await expect($('.game-card-title-name')).toHaveText('普通聊天');
  });

  it('should display the initial Chat panel controls and empty state', async () => {
    await expect($('.chat-input-textarea')).toExist();
    await expect($('.chat-input-area button[type="submit"]')).toExist();
    await expect($('.chat-empty')).toHaveText(expect.stringContaining('开始对话'));
  });

  it('should display settings panel and title after hover', async () => {
    await $('.settings-trigger-zone').moveTo();
    await expect($('.settings-panel')).toBeDisplayed();
    await expect($('.settings-title')).toHaveText(expect.stringContaining('系统配置'));
  });

  it('should show model configuration fields', async () => {
    await invoke('save_model_config', { config: {
      apiUrl: server.url,
      apiKey: 'settings-key',
      modelName: 'settings-model',
      protocol: 'openai'
    } });
    await refreshApp();
    await $('.settings-trigger-zone').moveTo();
    await expect($('.config-summary-card')).toExist();
    expect((await $$('.settings-field-label')).length).toBeGreaterThanOrEqual(4);
    const labels = await browser.execute(() => (
      [...document.querySelectorAll('.settings-field-label')].map(element => element.textContent)
    ));
    expect(labels.some(label => label.includes('模型 URL'))).toBe(true);
  });

  it('should save model configuration through Tauri', async () => {
    const config = {
      apiUrl: 'https://e2e-test.example.com/v1',
      apiKey: 'e2e-test-key-12345',
      modelName: 'e2e-test-model',
      protocol: 'openai'
    };
    expect(await invoke('save_model_config', { config })).toEqual(config);
    expect(await invoke('get_model_config')).toEqual(config);
  });

  it('should keep model configuration after application restart', async () => {
    const config = {
      apiUrl: server.url,
      apiKey: 'persistent-key',
      modelName: 'persistent-model',
      protocol: 'openai'
    };
    await invoke('save_model_config', { config });
    await refreshApp();
    expect(await invoke('get_model_config')).toEqual(config);
  });
});
