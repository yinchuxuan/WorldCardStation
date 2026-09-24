/* global browser, $, before, after */
const fs = require('node:fs');
const path = require('node:path');
const { invoke, refreshApp, resetNoCard, revealHeader, sendMessage } = require('./support/tauri');
const { StreamServer } = require('./support/streamServer');

const source = path.resolve('test-results/tauri-e2e/card');
const entry = path.join(source, 'card.json');
const installed = path.resolve('test-results/tauri-e2e/data/game-cards/cards/project-file-e2e');
const card = { formatVersion: '1', id: 'project-file-e2e', name: 'Project File Test', version: '1',
  main: 'project-entry.js', agents: { narrator: 'project-agent.json' }, files: { intro: 'project-intro.md' } };

async function importProject() {
  await revealHeader();
  const trigger = $('.game-card-title-main');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const button = $('[aria-label="导入游戏卡文件"]');
  await button.waitForEnabled();
  await button.click();
}

describe('Project card.json through the single file import button', () => {
  let original;
  let beforeHistory;
  let beforeSessions;
  let server;
  before(async () => {
    server = await new StreamServer().start();
    await invoke('save_model_config', { config: { apiUrl: server.url, apiKey: 'project-test', modelName: 'test', protocol: 'openai' } });
    original = fs.readFileSync(entry);
    fs.writeFileSync(entry, JSON.stringify(card));
    fs.writeFileSync(path.join(source, 'project-intro.md'), 'PROJECT INTRO');
    fs.writeFileSync(path.join(source, 'project-agent.json'), JSON.stringify({ model: 'default', rules: { $import: 'project-rules.json' } }));
    fs.writeFileSync(path.join(source, 'project-entry.js'), `export async function onInput(ctx) {
      const call = ctx.agents.call('narrator'); await call.done();
      const msg = ctx.agents.messages('narrator').find(msg => msg.id === call.messageId);
      await ctx.present(ctx.createReader({ source: msg.content, mode: 'continuous' }));
    }`);
    fs.writeFileSync(path.join(source, 'project-rules.json'), JSON.stringify([
      { when: { phase: 'init' }, then: [{ type: 'insert', role: 'system', content: '{{file:intro}}' }] },
      { when: { phase: 'post_response' }, then: [{ type: 'replace', predicate: { role: 'assistant' }, content: '{{file:intro}}' }] }
    ]));
    for (const directory of ['.wcs', '.git', 'sessions']) {
      fs.mkdirSync(path.join(source, directory), { recursive: true });
      fs.writeFileSync(path.join(source, directory, 'project-private.txt'), 'private source data');
    }
    await resetNoCard();
  });

  after(async () => {
    fs.writeFileSync(entry, original);
    for (const file of ['project-intro.md', 'project-rules.json', 'project-agent.json', 'project-entry.js', '.wcs/project-private.txt',
      '.git/project-private.txt', 'sessions/project-private.txt']) {
      fs.rmSync(path.join(source, file), { force: true });
    }
    await invoke('set_active_game_card', { id: null });
    await refreshApp();
    await server.close();
  });

  it('installs the entire directory and runs imported rules without a source menu', async () => {
    await importProject();
    // Preparing the new runtime remounts the header; reacquire its node on every poll.
    await browser.waitUntil(async () => browser.execute(name => (
      document.querySelector('.game-card-title-name')?.textContent === name
    ), card.name));
    await expect($('.game-card-title-name')).toHaveText(card.name);
    await expect($('.chat-history')).not.toHaveText(expect.stringContaining('PROJECT INTRO'));
    server.queueOpenAi('model output'); await sendMessage('开始');
    await expect($('.chat-history')).toHaveText(expect.stringContaining('PROJECT INTRO'));
    await expect($('.game-card-import-choices')).not.toExist();
    expect((await invoke('get_active_game_card')).id).toBe(card.id);
    for (const file of ['project-rules.json', 'project-intro.md', 'ui/root.js', 'images/scene.jpg']) {
      expect(fs.readFileSync(path.join(installed, file))).toEqual(fs.readFileSync(path.join(source, file)));
    }
    for (const directory of ['.wcs', '.git', 'sessions']) {
      expect(fs.existsSync(path.join(installed, directory, 'project-private.txt'))).toBe(false);
      expect(fs.existsSync(path.join(source, directory, 'project-private.txt'))).toBe(true);
    }
  });

  it('reimports updated resources while retaining the existing session and history', async () => {
    await browser.waitUntil(async () => (await invoke('get_chat_history')).runtimeSession?.current.records.length === 1);
    beforeHistory = await invoke('get_chat_history');
    beforeSessions = await invoke('list_chat_sessions');
    fs.writeFileSync(entry, JSON.stringify({ ...card, version: '2' }));
    fs.writeFileSync(path.join(source, 'project-intro.md'), 'UPDATED INTRO');
    await importProject();
    await browser.waitUntil(async () => (await invoke('get_active_game_card')).version === '2');
    await browser.waitUntil(async () => !(await $('.game-card-title-main').getAttribute('disabled')));
    expect((await invoke('list_chat_sessions')).activeId).toBe(beforeSessions.activeId);
    expect((await invoke('get_chat_history')).messages).toEqual(beforeHistory.messages);
    await expect($('body')).toHaveText(expect.stringContaining('card identity'));
    expect(fs.readFileSync(path.join(installed, 'project-intro.md'), 'utf8')).toBe('UPDATED INTRO');
  });

  it('leaves the installed card and session unchanged if the selected project is invalid', async () => {
    const before = await invoke('get_active_game_card');
    fs.writeFileSync(entry, JSON.stringify({ ...card, agents: { narrator: 'missing-project-agent.json' } }));
    await importProject();
    await expect($('.game-card-import-message')).toHaveText('导入失败，请查看错误详情');
    expect(await invoke('get_active_game_card')).toEqual(before);
    expect((await invoke('list_chat_sessions')).activeId).toBe(beforeSessions.activeId);
    expect((await invoke('get_chat_history')).messages).toEqual(beforeHistory.messages);
    expect(fs.readFileSync(path.join(installed, 'project-intro.md'), 'utf8')).toBe('UPDATED INTRO');
    await expect($('.game-card-switch-panel[data-state="open"]')).toExist();
  });
});
