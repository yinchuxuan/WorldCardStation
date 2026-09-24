/* global $ */

const { card } = require('./support/cards');
const {
  invoke, invokeError, refreshApp, resetNoCard, saveHistory
} = require('./support/tauri');

describe('Tauri history and game card storage', () => {
  beforeEach(async () => {
    await resetNoCard();
  });

  it('should save, clear and load chat history through Tauri', async () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ];
    await saveHistory(messages);
    expect((await invoke('get_chat_history')).messages.map(({ role, content }) => ({
      role, content
    }))).toEqual(messages);
    await saveHistory([]);
    expect((await invoke('get_chat_history')).messages).toEqual([]);
  });

  it('should persist chat history across application restart', async () => {
    await saveHistory([
      { role: 'user', content: 'Persist test' },
      { role: 'assistant', content: 'Response' }
    ]);
    await refreshApp();
    expect((await invoke('get_chat_history')).messages.map(item => item.content)).toEqual([
      'Persist test', 'Response'
    ]);
  });

  it('should save, list, read, activate and clear game cards', async () => {
    const first = card('e2e_quest_card', 'E2E Quest');
    const second = card('e2e_second_card', 'Second Quest');
    await require('./support/tauri').saveCard(first);
    await require('./support/tauri').saveCard(second);
    const ids = (await invoke('get_game_cards')).map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(await invoke('get_game_card', { id: first.id })).toEqual(first);
    await invoke('set_active_game_card', { id: first.id });
    expect((await invoke('get_active_game_card')).name).toBe('E2E Quest');
    await invoke('set_active_game_card', { id: null });
    expect(await invoke('get_active_game_card')).toBeNull();
  });

  it('should show the active game card title after restart', async () => {
    const active = card('e2e_title_card', 'Title Quest');
    await require('./support/tauri').saveCard(active);
    await invoke('set_active_game_card', { id: active.id });
    await refreshApp();
    await expect($('.game-card-title-name')).toHaveText('Title Quest');
    expect(await $('.game-card-title-control').getAttribute('class')).toContain('loaded');
  });

  it('should reject unsafe card ids at the Tauri boundary', async () => {
    const error = await invokeError('e2e_seed_game_card', {
      card: { version: '1.0', id: '../escape', name: 'bad', rules: [] }
    });
    expect(error).toContain('safe id');
  });

  it('should create and persist chat sessions', async () => {
    await refreshApp();
    const created = await invoke('create_chat_session', { title: 'E2E Session' });
    await invoke('set_active_chat_session', { id: created.id });
    await saveHistory([{ role: 'user', content: 'Session message' }]);
    await refreshApp();
    const sessions = await invoke('list_chat_sessions');
    expect(sessions.activeId).toBe(created.id);
    expect(sessions.sessions.some(item => item.id === created.id)).toBe(true);
    expect((await invoke('get_chat_history')).messages[0].content).toBe('Session message');
  });
});
