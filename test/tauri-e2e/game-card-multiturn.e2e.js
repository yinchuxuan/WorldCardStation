/* global browser, before, after */

const { card } = require('./support/cards');
const { StreamServer } = require('./support/streamServer');
const {
  activateCard, deactivateCard, invoke, sendMessage, waitForHistory
} = require('./support/tauri');

describe('Tauri multi-turn game card pipeline', () => {
  let server;

  before(async () => { server = await new StreamServer().start(); });
  after(async () => server.close());
  beforeEach(async () => {
    server.reset();
    await invoke('save_model_config', { config: {
      apiUrl: server.url, apiKey: 'turn-key', modelName: 'turn-model', protocol: 'openai'
    } });
  });

  it('should preserve card rules and decay TTL across two turns', async () => {
    const multi = card('multi-turn-card', 'Multi Turn', [
      { when: { phase: 'pre_send' }, then: [
        { type: 'insert', predicate: { index: 0 }, role: 'system',
          content: 'Game rules apply', _meta: { visibility: 'llm_only' } },
        { type: 'replace', predicate: { role: 'user' }, content: '[Player] {{original_content}}' }
      ] },
      { when: { phase: 'post_response' }, then: [
        { type: 'insert', predicate: { index: 'last' }, anchor: 'after', role: 'system',
          content: 'round hint', ttl: 2, _meta: { visibility: 'llm_only' } }
      ] }
    ]);
    await activateCard(multi);
    server.queueOpenAi('turn 1 response');
    server.queueOpenAi('turn 2 response');
    await sendMessage('turn 1');
    await browser.waitUntil(() => server.requests.length === 1);
    await waitForHistory(value => value.runtimeSession.current.contexts.narrator.messages.some(item => item.content === 'round hint'));
    await sendMessage('turn 2');
    await browser.waitUntil(() => server.requests.length === 2);
    expect(server.requests[0].messages.some(item => item.content === 'Game rules apply')).toBe(true);
    expect(server.requests[0].messages.some(item => item.content === '[Player] turn 1')).toBe(true);
    expect(server.requests[1].messages.some(item => item.content === 'round hint')).toBe(true);
    const saved = await waitForHistory(value => (
      value.runtimeSession.current.contexts.narrator.messages.filter(item => item.content === 'round hint').length === 2
    ));
    expect(saved.runtimeSession.current.contexts.narrator.messages.find(item => item.content === 'round hint').ttl).toBe(1);
  });

  it('should extract Anthropic system messages during multi-turn setup', async () => {
    await invoke('save_model_config', { config: {
      apiUrl: server.url, apiKey: 'turn-key', modelName: 'turn-model', protocol: 'anthropic',
      maxTokens: 4096
    } });
    await activateCard(card('multi-anthropic', 'Anthropic Multi', [{
      when: { phase: 'pre_send' }, then: [{
        type: 'insert', predicate: { index: 0 }, role: 'system',
        content: 'SYS', _meta: { visibility: 'llm_only' }
      }]
    }]));
    server.queueAnthropic('reply');
    await sendMessage('hello');
    await browser.waitUntil(() => server.requests.length === 1);
    expect(server.requests[0].system).toBe('SYS');
    expect(server.requests[0].messages.every(item => item.role !== 'system')).toBe(true);
    expect(server.requests[0]).toEqual(expect.objectContaining({
      model: 'turn-model', max_tokens: 4096
    }));
  });

  it('should stop applying a card after deactivation', async () => {
    await activateCard(card('multi-deactivate', 'Deactivate', [{
      when: { phase: 'pre_send' }, then: [{
        type: 'replace', predicate: { role: 'user' }, content: 'MOD: {{original_content}}'
      }]
    }]));
    server.queueOpenAi('ok');
    await sendMessage('with card');
    await browser.waitUntil(() => server.requests.length === 1);
    expect(server.requests[0].messages[0].content).toBe('MOD: with card');

    await deactivateCard();
    server.queueOpenAi('ok');
    await sendMessage('without card');
    await browser.waitUntil(() => server.requests.length === 2);
    const users = server.requests[1].messages.filter(item => item.role === 'user');
    expect(users.at(-1).content).toBe('without card');
  });

  it('should expire a TTL message after its configured turns', async () => {
    await activateCard(card('multi-ttl', 'TTL Expire', [{
      when: { phase: 'post_response', length: 2 }, then: [{
        type: 'insert', predicate: { index: 'last' }, anchor: 'after', role: 'system',
        content: 'temp', ttl: 3, _meta: { visibility: 'llm_only' }
      }]
    }]));
    for (let turn = 1; turn <= 4; turn += 1) {
      server.queueOpenAi('ok');
      await sendMessage(`t${turn}`);
      await browser.waitUntil(() => server.requests.length === turn);
      const saved = await waitForHistory(value => {
        const temp = value.runtimeSession.current.contexts.narrator.messages.find(item => item.content === 'temp');
        return value.runtimeSession.current.contexts.narrator.messages.filter(item => item.role === 'assistant').length === turn
          && (turn < 4 ? temp?.ttl === 4 - turn : !temp);
      });
      const temp = saved.runtimeSession.current.contexts.narrator.messages.find(item => item.content === 'temp');
      if (turn < 4) expect(temp.ttl).toBe(4 - turn);
      else expect(temp).toBeUndefined();
    }
  });

  it('should persist exec state across turns', async () => {
    await activateCard(card('multi-state', 'State Persist', [
      { when: { phase: 'pre_send' }, then: [{ type: 'exec',
        source: 'state.score = (state.score || 0) + 10; return { messages, state };' }] },
      { when: { phase: 'post_response' }, then: [{ type: 'exec',
        source: 'state.score += 5; return { messages, state };' }] }
    ]));
    server.queueOpenAi('ok'); server.queueOpenAi('ok');
    await sendMessage('score check');
    await waitForHistory(value => value.gameState.score === 15);
    await sendMessage('score again');
    await waitForHistory(value => value.gameState.score === 30);
  });
});
