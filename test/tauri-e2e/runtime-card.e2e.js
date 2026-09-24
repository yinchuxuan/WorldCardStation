/* global browser, $, before, after */
const fs = require('node:fs');
const path = require('node:path');
const { StreamServer } = require('./support/streamServer');
const { invoke, refreshApp, sendMessage, waitForHistory } = require('./support/tauri');

describe('native imported multi-Agent card', () => {
  let server;
  const original = new Map();
  const source = path.resolve('test-results/tauri-e2e/card');
  before(async () => {
    server = await new StreamServer().start();
    const fixture = path.resolve('test/fixtures/runtime-delivery');
    for (const file of fs.readdirSync(fixture, { recursive: true }).filter(file => fs.statSync(path.join(fixture, file)).isFile())) {
      const target = path.join(source, file);
      original.set(target, fs.existsSync(target) ? fs.readFileSync(target) : null);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(fixture, file), target);
    }
    await invoke('save_model_config', { config: { apiUrl: server.url, apiKey: 'runtime-test-only', modelName: 'test', protocol: 'openai' } });
    await invoke('import_game_card_from_file');
    await refreshApp();
  });
  after(async () => {
    for (const [file, bytes] of original) {
      if (bytes) fs.writeFileSync(file, bytes); else fs.rmSync(file, { force: true });
    }
    await invoke('set_active_game_card', { id: null });
    await refreshApp();
    await server?.close();
  });
  it('runs imported modules, automatically saves full contexts and resumes without repeating init', async () => {
    await expect($('.game-card-title-name')).toHaveText('Judge 与 Narrator');
    server.queueOpenAi('<state_patch>{"verdict":"通过"}</state_patch>');
    server.queueOpenAi('实际展示');
    await sendMessage('第一轮');
    const saved = await waitForHistory(history => history.runtimeSession?.current.records.length === 1);
    expect(saved.runtimeSession.current.contexts.narrator.messages.at(-1).content).toBe('最终历史');
    expect(saved.runtimeSession.current.records[0].content).toBe('实际展示');
    await refreshApp();
    await expect($('.chat-history')).toHaveText(expect.stringContaining('实际展示'));
    server.queueOpenAi('<state_patch>{"verdict":"继续"}</state_patch>');
    server.queueOpenAi('第二段实际展示');
    await sendMessage('第二轮');
    const next = await waitForHistory(history => history.runtimeSession?.current.records.length === 2);
    expect(next.runtimeSession.current.contexts.judge.messages.filter(msg => msg.role === 'system')).toHaveLength(1);
    expect(server.requests[3].messages.some(msg => msg.content.includes('继续'))).toBe(true);
    // This test verifies history data, not auto-hide/hover animation (covered by chat-layout).
    await browser.execute(() => document.querySelector('.chat-header-clickable').click());
    await $('button[aria-label="下一个 Agent"]').click();
    await expect($('.chat-history')).toHaveText(expect.stringContaining('最终历史'));
    await $('button[aria-label="上一个 Agent"]').click();
    await expect($('.chat-history')).toHaveText(expect.stringContaining('verdict'));
  });
});
