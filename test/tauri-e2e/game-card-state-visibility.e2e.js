/* global browser, $, before, after */

const { card } = require('./support/cards');
const { StreamServer } = require('./support/streamServer');
const {
  activateCard, getHistory, invoke, revealHeader, sendMessage, waitForHistory
} = require('./support/tauri');

function patchResponse(label) {
  return [
    `response ${label}`,
    '<state_patch>',
    `[{"type":"state.append","path":"events","value":"${label}"}]`,
    '</state_patch>'
  ].join('\n');
}

describe('Tauri state patch and visibility', () => {
  let server;

  before(async () => { server = await new StreamServer().start(); });
  after(async () => server.close());
  beforeEach(async () => {
    server.reset();
    await invoke('save_model_config', { config: {
      apiUrl: server.url, apiKey: 'state-key', modelName: 'state-model', protocol: 'openai'
    } });
  });

  it('should apply state_patch and retry from the saved snapshot', async () => {
    await activateCard(card('state-patch-card', 'State Patch', [], {
      state: { schema: { events: { type: 'array', default: [] } } }
    }));
    server.queueOpenAi(patchResponse('first'));
    server.queueOpenAi(patchResponse('retry'));
    await sendMessage('record event');
    let history = await waitForHistory(value => value.gameState.events?.[0] === 'first');
    expect(history.runtimeSession.retryBase.snapshot.state).toEqual({ events: [] });
    expect(history.runtimeSession.current.contexts.narrator.messages.map(item => item.content)).toEqual([
      'record event', patchResponse('first')
    ]);

    await browser.execute(() => document.querySelector('.retry-btn')?.click());
    history = await waitForHistory(value => value.gameState.events?.[0] === 'retry');
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1].messages).toEqual([
      { role: 'user', content: 'record event' }
    ]);
    expect(history.runtimeSession.current.contexts.narrator.messages.map(item => item.content)).toEqual([
      'record event', patchResponse('retry')
    ]);
  });

  it('should persist llm_only messages but hide them from dialogue UI', async () => {
    await activateCard(card('visibility-llm', 'Vis LLM', [{
      when: { phase: 'pre_send' }, then: [{
        type: 'insert', predicate: { index: 0 }, role: 'system',
        content: 'secret system prompt', _meta: { visibility: 'llm_only' }
      }]
    }]));
    server.queueOpenAi('ok');
    await sendMessage('hello');
    const saved = await waitForHistory(value => value.runtimeSession.current.contexts.narrator.messages.length >= 3);
    expect(saved.runtimeSession.current.contexts.narrator.messages.some(item => item.content === 'secret system prompt')).toBe(true);
    await expect($('.chat-history')).not.toHaveText(expect.stringContaining('secret system prompt'));
  });

  it('should persist plain system messages but hide them from dialogue UI', async () => {
    await activateCard(card('visibility-system', 'Vis System', [{
      when: { phase: 'pre_send' }, then: [{
        type: 'insert', predicate: { index: 0 }, role: 'system',
        content: 'plain system prompt'
      }]
    }]));
    server.queueOpenAi('ok');
    await sendMessage('hello');
    const saved = await waitForHistory(value => value.runtimeSession.current.contexts.narrator.messages.length >= 3);
    expect(saved.runtimeSession.current.contexts.narrator.messages.some(item => (
      item.role === 'system' && item.content === 'plain system prompt'
    ))).toBe(true);
    const text = await $('.chat-history').getText();
    expect(text).toContain('hello');
    expect(text).toContain('ok');
    expect(text).not.toContain('plain system prompt');
  });

  it('should display the active card name in the header control', async () => {
    await activateCard(card('visibility-title', 'My Adventure'));
    await revealHeader();
    await expect($('.game-card-title-name')).toHaveText('My Adventure');
    expect((await getHistory()).messages).toEqual([]);
  });
});
