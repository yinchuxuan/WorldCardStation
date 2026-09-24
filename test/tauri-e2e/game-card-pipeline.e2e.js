/* global browser, $, before, after */

const { card, pipelineCard } = require('./support/cards');
const { StreamServer } = require('./support/streamServer');
const {
  activateCard, invoke, sendMessage, waitForHistory
} = require('./support/tauri');

describe('Tauri game card send pipeline', () => {
  let server;

  before(async () => { server = await new StreamServer().start(); });
  after(async () => server.close());
  beforeEach(async () => {
    server.reset();
    await invoke('save_model_config', { config: {
      apiUrl: server.url, apiKey: 'pipeline-key',
      modelName: 'pipeline-model', protocol: 'openai'
    } });
  });

  it('should apply pre_send and post_response rules in the real UI flow', async () => {
    await activateCard(pipelineCard('pipeline-openai'));
    server.queueOpenAi('```model says ok```');
    await sendMessage('hello');
    const history = await waitForHistory(value => value.runtimeSession.current.contexts.narrator.messages.length === 4);
    expect(server.requests[0].messages).toEqual([
      { role: 'system', content: 'SYSTEM RULES' },
      { role: 'user', content: '[player] hello' }
    ]);
    expect(history.runtimeSession.current.contexts.narrator.messages.map(item => item.content)).toEqual([
      'SYSTEM RULES', '[player] hello', 'model says ok', 'temporary hint'
    ]);
    expect(history.runtimeSession.current.contexts.narrator.messages[3].ttl).toBe(2);
    await expect($('.chat-history')).not.toHaveText(expect.stringContaining('SYSTEM RULES'));
  });

  it('should adapt system messages to Anthropic top-level system', async () => {
    await invoke('save_model_config', { config: {
      apiUrl: server.url, apiKey: 'pipeline-key',
      modelName: 'pipeline-model', protocol: 'anthropic'
    } });
    await activateCard(pipelineCard('pipeline-anthropic'));
    server.queueAnthropic('ok');
    await sendMessage('anthropic hello');
    await browser.waitUntil(() => server.requests.length === 1);
    expect(server.requests[0].system).toBe('SYSTEM RULES');
    expect(server.requests[0].messages).toEqual([
      { role: 'user', content: '[player] anthropic hello' }
    ]);
  });

  it('should resolve declared files through the safe Tauri resource command', async () => {
    const fileCard = card('pipeline-file', 'File Quest', [{
      when: { phase: 'pre_send' },
      then: [{
        type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system',
        content: '{{file:rules}}', _meta: { visibility: 'llm_only' }
      }]
    }], { files: { rules: 'worldbook/rules.md' } });
    await activateCard(fileCard, {
      'worldbook/rules.md': 'File rules: stay in scene.'
    });
    server.queueOpenAi('ok');
    await sendMessage('start');
    await browser.waitUntil(() => server.requests.length === 1);
    expect(server.requests[0].messages[0]).toEqual({
      role: 'system', content: 'File rules: stay in scene.'
    });
    await expect($('.chat-history')).not.toHaveText(expect.stringContaining('File rules'));
  });

  it('should reject unsupported content before the model request', async () => {
    await activateCard(card('pipeline-bad-file', 'Bad File', [{
      when: { phase: 'pre_send' },
      then: [{
        type: 'insert', predicate: { index: 0 }, role: 'system',
        content: '{{unknown_source:rules}}'
      }]
    }]));
    await sendMessage('start');
    await expect($('body')).toHaveText(
      expect.stringContaining('unsupported content source: unknown_source:rules')
    );
    expect(server.requests).toHaveLength(0);
  });

  it('should run exec and persist transformed messages', async () => {
    await activateCard(card('pipeline-exec', 'Exec Quest', [
      {
        when: { phase: 'pre_send' },
        then: [{
          type: 'exec',
          source: 'messages[messages.length - 1].content = "[exec] " + messages[messages.length - 1].content; return { messages };'
        }]
      },
      {
        when: { phase: 'post_response' },
        then: [{
          type: 'exec',
          source: 'messages.push({ role: "system", content: "exec after", ttl: 2, _meta: { visibility: "llm_only" } }); return { messages };'
        }]
      }
    ]));
    server.queueOpenAi('done');
    await sendMessage('move');
    const saved = await waitForHistory(value => value.runtimeSession.current.contexts.narrator.messages.length === 3);
    expect(saved.runtimeSession.current.contexts.narrator.messages.map(item => item.content)).toEqual([
      '[exec] move', 'done', 'exec after'
    ]);
    expect(saved.runtimeSession.current.contexts.narrator.messages[2].ttl).toBe(2);
  });

  it('should terminate a non-returning exec without sending a request', async () => {
    await activateCard(card('pipeline-timeout', 'Exec Timeout', [{
      when: { phase: 'pre_send' },
      then: [{ type: 'exec', source: 'while (true) {}' }]
    }]));
    await sendMessage('start');
    await expect($('body')).toHaveText(
      expect.stringContaining('main.js computation timed out')
    );
    expect(server.requests).toHaveLength(0);
  });
});
