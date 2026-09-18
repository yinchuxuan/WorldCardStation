/* global browser, $, before, after */
const fs = require('node:fs');
const path = require('node:path');
const { invoke, refreshApp, revealHeader, sendMessage } = require('./support/tauri');
const http = require('node:http');

function comparableHistory(history) {
  // Reload can regenerate temporary prompt IDs; real message IDs and all other session data must survive.
  return { ...history, messages: history.messages.map(message => {
    if (message.ttl !== 1 || message._meta?.visibility !== 'llm_only') return message;
    return { ...message, id: '<temporary-prompt>' };
  }) };
}

describe('Tavern import through the single card button', () => {
  let server;
  let payload;
  const fixture = path.resolve('test-results/tauri-e2e/tavern.json');
  const writeSource = (lossy = false) => {
    fs.writeFileSync(fixture, JSON.stringify({
      spec: 'chara_card_v3', spec_version: '3.0', data: {
        name: 'Tavern Import Test', nickname: 'Alice', creator: 'Test author', description: '{{char}} with {{user}}',
        first_mes: lossy ? '{{unknown}}' : 'Hello {{user}} {{setvar::count::1}}', post_history_instructions: 'Count {{getvar::count}}',
        extensions: { fav: true, talkativeness: 0.5, depth_prompt: { prompt: '', depth: 4 } },
        character_book: { entries: [{ id: 1, name: 'School', keys: ['school'], content: 'WORLD {{char}}', enabled: true, insertion_order: 100, position: 'after_char' }] }
      }
    }));
  };
  before(async () => {
    writeSource(true);
    server = http.createServer((request, response) => {
      let text = '';
      request.on('data', chunk => { text += chunk; });
      request.on('end', () => {
        payload = JSON.parse(text);
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: {"choices":[{"delta":{"content":"Import works"}}]}\n\ndata: [DONE]\n\n');
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await invoke('save_model_config', { config: { apiUrl: `http://127.0.0.1:${server.address().port}/v1`,
      apiKey: 'test', modelName: 'test', protocol: 'openai' } });
    await refreshApp();
  });

  after(async () => {
    server?.closeAllConnections();
    if (server) await new Promise(resolve => server.close(resolve));
  });

  it('cancels compatibility differences without installing or activating', async () => {
    await browser.execute(() => document.querySelector('.game-card-title-main').click());
    await browser.execute(() => document.querySelector('.game-card-switch-import').click());
    await browser.waitUntil(async () => {
      const error = await browser.execute(() => document.querySelector('.game-card-title-control')?.title);
      if (error?.startsWith('导入游戏卡失败')) throw new Error(error);
      return $('.tavern-import-dialog').isExisting();
    });
    await expect($('#tavern-import-title')).toHaveText('酒馆卡兼容差异');
    expect(await invoke('get_active_game_card')).toBeNull();
    await browser.execute(() => [...document.querySelectorAll('.tavern-import-dialog button')].find(button => button.textContent === '取消').click());
    await $('.tavern-import-dialog').waitForExist({ reverse: true });
    expect(await invoke('get_game_cards')).toEqual([]);
  });

  it('converts with a built-in Worker, installs and runs the ordinary card with its worldbook', async () => {
    writeSource();
    await browser.waitUntil(async () => !(await $('.game-card-switch-import').getAttribute('disabled')));
    await browser.execute(() => document.querySelector('.game-card-switch-import').click());
    await expect($('.game-card-title-name')).toHaveText('Tavern Import Test');
    await expect($('.tavern-import-dialog')).not.toExist();
    await browser.waitUntil(async () => (await $('.game-card-title-main').getAttribute('aria-expanded')) === 'false');
    await browser.waitUntil(async () => (await invoke('get_chat_history')).messages.some(message => message.content === 'Hello User '));
    await sendMessage('school');
    await browser.waitUntil(async () => !!payload);
    expect(payload.messages.map(message => message.content)).toEqual(expect.arrayContaining(['Alice with User', 'WORLD Alice', 'Count 1']));
    await browser.waitUntil(async () => (await invoke('get_chat_history')).messages.some(message => message.content === 'Import works'));
    await browser.reloadSession();
    await $('.app-container').waitForExist();
    const history = await invoke('get_chat_history');
    expect(history.messages.filter(message => message.content === 'Hello User ')).toHaveLength(1);
    expect(history.gameState.__tavern.initialized).toBe(true);
  });

  it('requires a separate overwrite confirmation and preserves the existing session', async () => {
    await browser.waitUntil(async () => !(await $('.game-card-title-main').getAttribute('disabled')));
    await revealHeader();
    const original = await invoke('get_active_game_card');
    const history = await invoke('get_chat_history');
    await browser.execute(() => {
      const trigger = document.querySelector('.game-card-title-main');
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    });
    await $('.game-card-switch-panel[data-state="open"] .game-card-switch-update').waitForDisplayed();
    await browser.execute(() => document.querySelector('.game-card-switch-update').click());
    await $('.tavern-import-dialog').waitForExist();
    await expect($('#tavern-import-title')).toHaveText('确认覆盖游戏卡');
    expect(await invoke('get_active_game_card')).toEqual(original);
    await browser.execute(() => [...document.querySelectorAll('.tavern-import-dialog button')].find(button => button.textContent === '取消').click());
    await browser.waitUntil(async () => !(await $('.game-card-switch-update').getAttribute('disabled')));
    expect(comparableHistory(await invoke('get_chat_history'))).toEqual(comparableHistory(history));
    await browser.execute(() => document.querySelector('.game-card-switch-update').click());
    await $('.tavern-import-dialog').waitForExist();
    await browser.execute(() => [...document.querySelectorAll('.tavern-import-dialog button')].find(button => button.textContent.trim() === '覆盖并导入').click());
    await $('.tavern-import-dialog').waitForExist({ reverse: true });
    await browser.waitUntil(async () => !(await $('.game-card-title-main').getAttribute('disabled')));
    expect((await invoke('get_active_game_card')).id).toBe(original.id);
    expect(await invoke('get_game_cards')).toHaveLength(1);
    expect(comparableHistory(await invoke('get_chat_history'))).toEqual(comparableHistory(history));
  });
});
