/* global browser, $ */
const fs = require('node:fs');
const path = require('node:path');
const { activateCard, invoke, refreshApp, waitForHistory } = require('./support/tauri');

describe('new Session startup in the shared player', () => {
  it('shows init Messages with an editable input, saves after reading and does not replay after reload', async () => {
    const root = path.resolve('test/fixtures/runtime-startup');
    const files = Object.fromEntries(fs.readdirSync(root).map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
    await activateCard(JSON.parse(files['card.json']), files);
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup first 1'));
    await expect($('[data-gc-part="chat-input-textarea"]')).toBeEnabled();
    await expect($('[aria-label="停止运行"]')).not.toExist();
    await expect($('[aria-label="管理聊天会话"]')).toBeDisabled();
    await browser.execute(() => document.querySelector('.segmented-reading-page').click());
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup second'));
    await browser.execute(() => document.querySelector('.segmented-reading-page').click());
    const saved = await waitForHistory(history => history.runtimeSession?.started && history.gameState.count === 3);
    expect(saved.messages.map(msg => msg.role)).toEqual(['assistant']);
    expect(saved.runtimeSession.current.contexts.judge.messages).toHaveLength(1);
    await refreshApp();
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup second'));
    await expect($('.chat-input-area button[type="submit"]')).toHaveAttribute('aria-label', '发送消息');
    const restored = await waitForHistory(history => history.runtimeSession?.started);
    expect(restored.runtimeSession.current).toEqual(saved.runtimeSession.current);
  });
  it('reloads an unfinished opening without saving it and restarts from the first page', async () => {
    const created = await invoke('create_chat_session', { title: 'Opening cancellation' });
    await invoke('set_active_chat_session', { id: created.id });
    await refreshApp();
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup first 1'));
    expect((await invoke('get_chat_history')).runtimeSession).toBeUndefined();
    await refreshApp();
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup first 1'));
    await browser.execute(() => document.querySelector('.segmented-reading-page').click());
    await expect($('.segmented-reading-page')).toHaveText(expect.stringContaining('Startup second'));
    await browser.execute(() => document.querySelector('.segmented-reading-page').click());
    const saved = await waitForHistory(history => history.runtimeSession?.started && history.gameState.count === 3);
    expect(saved.runtimeSession.current.contexts.judge.messages).toHaveLength(1);
    expect(saved.runtimeSession.current.records).toHaveLength(1);
  });
});
