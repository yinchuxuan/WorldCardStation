const {
  loadActiveGameCard,
  preparePreSendMessages,
  prepareAfterResponseMessages,
  toApiMessages
} = require('../../src/renderer/gameCard/sendPipeline');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');
const platform = createTestGameCardPlatform(() => global.platformMock);
const preparePreSend = (options) => preparePreSendMessages({ ...options, platform });
function cardWithInsert(content, files) {
  return {
    version: '1',
    id: 'send-card',
    name: 'Send Card',
    files,
    rules: [{
      when: { phase: 'pre_send' },
      then: [{
        type: 'insert',
        predicate: { index: 0 },
        anchor: 'before',
        role: 'system',
        content,
        _meta: { visibility: 'llm_only' }
      }]
    }]
  };
}

describe('game card send pipeline', () => {
  beforeEach(() => {
    global.platformMock.readGameCardFile.mockClear();
  });

  test('returns the original messages object when no card is active', async () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const result = await preparePreSend({ messages, card: null });

    expect(result.applied).toBe(false);
    expect(result.messages).toBe(messages);
    expect(result.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  test('distinguishes no repository from a failed card read', async () => {
    await expect(loadActiveGameCard(null)).resolves.toBeNull();
    await expect(loadActiveGameCard({ repository: { getActiveCard: jest.fn().mockRejectedValue(new Error('x')) } }))
      .rejects.toThrow('x');
  });

  test('applies pre_send rules only when a card is active', async () => {
    const messages = [{ role: 'user', content: 'start' }];
    const result = await preparePreSend({
      messages,
      card: cardWithInsert('system rules')
    });

    expect(result.applied).toBe(true);
    expect(result.messages).toEqual([
      { role: 'system', content: 'system rules', _meta: { visibility: 'llm_only' } },
      { role: 'user', content: 'start' }
    ]);
  });

  test('decays existing ttl messages before applying pre_send rules', async () => {
    const messages = [
      { role: 'system', content: 'expired', ttl: 1 },
      { role: 'system', content: 'kept', ttl: 2 },
      { role: 'user', content: 'start' }
    ];
    const result = await preparePreSend({
      messages,
      card: cardWithInsert('system rules')
    });

    expect(result.messages).toEqual([
      { role: 'system', content: 'system rules', _meta: { visibility: 'llm_only' } },
      { role: 'system', content: 'kept', ttl: 1 },
      { role: 'user', content: 'start' }
    ]);
    expect(result.ttlTrace.summary.messages).toMatchObject({ decayed: 1, removed: 1 });
  });

  test('preloads declared files through platformMock before applying rules', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: 'loaded rules'
    });
    const messages = [{ role: 'user', content: 'start' }];
    const result = await preparePreSend({
      messages,
      card: cardWithInsert('{{file:rules}}', { rules: 'worldbook/rules.md' })
    });

    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('send-card', 'worldbook/rules.md');
    expect(result.messages[0].content).toBe('loaded rules');
  });

  test('preloads declared files before resolving markdown sections', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: '# Routes\n## 雪菜线\nloaded route\n## 和纱线\nother'
    });
    const result = await preparePreSend({
      messages: [{ role: 'user', content: 'start' }],
      card: cardWithInsert('{{file:routes#雪菜线}}', { routes: 'worldbook/routes.md' })
    });

    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('send-card', 'worldbook/routes.md');
    expect(result.messages[0].content).toBe('loaded route');
  });

  test('preloads exec sourceFile through platformMock before applying rules', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: 'function run(ctx) { ctx.state.loadedScript = true; return { state: ctx.state }; }'
    });
    const card = cardWithInsert('unused');
    card.rules[0].then = [{ type: 'exec', sourceFile: 'scripts/timeline.js' }];
    const result = await preparePreSend({ messages: [], card });

    expect(global.platformMock.readGameCardFile).toHaveBeenCalledWith('send-card', 'scripts/timeline.js');
    expect(result.state.loadedScript).toBe(true);
  });

  test('gracefully returns applied=false when declared file preload fails', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: false,
      error: 'blocked path'
    });

    const result = await preparePreSend({
      messages: [{ role: 'user', content: 'start' }],
      card: cardWithInsert('{{file:rules}}', { rules: '../secret.md' })
    });

    expect(result.applied).toBe(false);
    expect(result.error).toBe('blocked path');
    expect(result.messages).toEqual([{ role: 'user', content: 'start' }]);
  });

  test('returns the original messages object after response when no card is active', async () => {
    const messages = [{ role: 'assistant', content: 'hello', ttl: 1 }];
    const result = await prepareAfterResponseMessages({ messages, card: null });

    expect(result.applied).toBe(false);
    expect(result.messages).toBe(messages);
    expect(result.messages).toEqual([{ role: 'assistant', content: 'hello', ttl: 1 }]);
  });

  test('applies after_response rules without decaying newly inserted ttl', async () => {
    const messages = [{ role: 'assistant', content: 'raw' }];
    const result = await prepareAfterResponseMessages({
      messages,
      card: {
        version: '1',
        id: 'after-card',
        name: 'After Card',
        rules: [{
          when: { phase: 'after_response', last: { role: 'assistant' } },
          then: [
            { type: 'replace', predicate: { index: 'last' }, content: 'clean' },
            { type: 'insert', predicate: { index: 'last' }, anchor: 'after', role: 'system', content: 'next', ttl: 1 }
          ]
        }]
      }
    });

    expect(result.applied).toBe(true);
    expect(result.messages).toEqual([
      { role: 'assistant', content: 'clean' },
      { role: 'system', content: 'next', ttl: 1 }
    ]);
    expect(result.ttlTrace).toBeNull();
  });

  test('maps runtime messages to API messages without runtime-only fields', () => {
    const messages = [
      { role: 'system', content: 'rules', ttl: 1, _meta: { visibility: 'llm_only' } },
      { role: 'system', content: 'trace', _meta: { visibility: 'debug_only' } },
      { role: 'user', content: 'hello' }
    ];

    expect(toApiMessages(messages)).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'hello' }
    ]);
  });
});
