/* global browser, $, before, after */

const http = require('node:http');
const { invoke, sendMessage, revealHeader, resetNoCard, waitForHistory } = require('./support/tauri');

describe('Tauri desktop application', () => {
  let server;
  let requestCount = 0;

  before(async () => {
    server = http.createServer((request, response) => {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        requestCount += 1;
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        if (body.includes('中止请求')) {
          response.write('data: {"choices":[{"delta":{"content":"等待中"}}]}\n\n');
          return;
        }
        response.end(`data: {"choices":[{"delta":{"content":"Tauri 回复 ${requestCount}"}}]}\n\ndata: [DONE]\n\n`);
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await invoke('save_model_config', {
      config: {
        apiUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: 'tauri-e2e-key',
        modelName: 'tauri-e2e-model',
        protocol: 'openai'
      }
    });
    await browser.refresh();
    await $('.app-container').waitForExist();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });

  it('loads settings through the Tauri storage adapter', async () => {
    await $('.settings-trigger-zone').moveTo();
    await $('.settings-panel').waitForDisplayed();
    await expect($('.settings-title')).toHaveText(expect.stringContaining('系统配置'));
    const stored = await invoke('get_model_config');
    expect(stored.modelName).toBe('tauri-e2e-model');
  });

  it('imports a card and mounts its dynamic UI, background and BGM', async () => {
    await revealHeader();
    await browser.execute(() => document.querySelector('.game-card-title-main')?.click());
    await $('.game-card-switch-import').click();
    await expect($('.game-card-title-name')).toHaveText('Tauri E2E Card');

    const localUi = await $('.tauri-e2e-ui');
    await localUi.waitForExist();
    await expect(localUi).toHaveText('本地交互 1');
    await waitForHistory(history => history.runtimeSession?.started === true);
    await browser.execute(() => document.querySelector('.tauri-e2e-ui')?.click());
    await expect(localUi).toHaveText('本地交互 2');
    await expect($('#game-card-ui-root')).not.toHaveAttribute('data-error');

    await browser.waitUntil(async () => {
      const style = await $('.app-background-layer-current').getAttribute('style');
      return style.includes('local');
    });
    const backgroundLoaded = await browser.execute(async () => {
      const source = document.querySelector('.app-background-layer-current')
        ?.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      if (!source) return false;
      return new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
        image.onerror = () => resolve(false);
        image.src = source;
      });
    });
    expect(backgroundLoaded).toBe(true);
    const audioSource = await $('.game-card-bgm-player audio').getAttribute('src');
    expect(audioSource).toContain('local');
    expect((await invoke('get_game_cards')).map(card => card.id)).toContain('tauri-e2e-card');
  });

  it('creates and persists chat sessions', async () => {
    await browser.execute(() => document.querySelector('.chat-session-btn')?.click());
    await $('[aria-label="新建会话"]').waitForExist();
    await browser.execute(() => document.querySelector('[aria-label="新建会话"]')?.click());
    await browser.waitUntil(async () => (await invoke('list_chat_sessions')).sessions.length >= 2);
    const sessions = await invoke('list_chat_sessions');
    expect(sessions.sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.activeId).toBeTruthy();
  });

  it('streams a reply and retries the last user message', async () => {
    await sendMessage('正常请求');
    await browser.waitUntil(async () => (await $('.chat-history').getText()).includes('Tauri 回复 1'));
    expect((await invoke('get_chat_history')).gameState.visual.portraits)
      .toEqual({ test: 'normal' });
    await browser.waitUntil(async () => browser.execute(() => {
      const image = document.querySelector('[data-gc-part="portrait-layer"] img');
      return !!image && image.src.includes('local') && image.complete
        && image.naturalWidth > 0 && image.naturalHeight > 0;
    }));
    const retry = await $('.retry-btn');
    await retry.waitForExist();
    await browser.execute(element => element.click(), retry);
    await browser.waitUntil(async () => (await $('.chat-history').getText()).includes('Tauri 回复 2'));
    expect(requestCount).toBe(2);
  });

  it('restores card, session, messages and state after an application restart', async () => {
    await browser.reloadSession();
    await $('.app-container').waitForExist();
    await expect($('.game-card-title-name')).toHaveText('Tauri E2E Card');
    await expect($('.tauri-e2e-ui')).toHaveText('本地交互 1');
    const history = await invoke('get_chat_history');
    expect(history.messages.some(message => message.content === '正常请求')).toBe(true);
    expect(history.gameState.score).toBe(1);
  });

  it('stops an ordinary-chat stream without saving a partial round', async () => {
    await resetNoCard();
    const baseline = await invoke('get_chat_history');
    await sendMessage('中止请求');
    await expect($('.chat-history')).toHaveText(expect.stringContaining('等待中'));
    const send = await $('.chat-input-area button[type="submit"]');
    await expect(send).toHaveAttribute('aria-label', '停止生成');
    await browser.execute(element => element.click(), send);
    await expect(send).toHaveAttribute('aria-label', '发送消息');
    await expect($('.chat-history')).not.toHaveText(expect.stringContaining('等待中'));
    expect((await invoke('get_chat_history')).runtimeSession.current).toEqual(baseline.runtimeSession.current);
  });
});
