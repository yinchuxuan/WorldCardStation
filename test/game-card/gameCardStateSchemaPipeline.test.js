const {
  prepareAfterResponseMessages,
  prepareInitMessages,
  preparePreSendMessages
} = require('../game-card/legacyPipelineHarness.js');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');
const platform = createTestGameCardPlatform(() => global.platformMock);
const preparePreSend = (options) => preparePreSendMessages({ ...options, platform });
const prepareAfterResponse = (options) => prepareAfterResponseMessages({ ...options, platform });
const prepareInit = (options) => prepareInitMessages({ ...options, platform });
function schemaCard(schemaFile = 'state/schema.json') {
  return {
    version: '1',
    id: 'state-card',
    name: 'State Card',
    stateSchema: schemaFile,
    rules: [{
      when: { phase: 'pre_send' },
      then: [{
        type: 'insert',
        predicate: { index: 0 },
        anchor: 'before',
        role: 'system',
        content: 'rules'
      }]
    }]
  };
}

function stateExecCard(phase) {
  return {
    version: '1',
    id: 'state-card',
    name: 'State Card',
    stateSchema: 'state/schema.json',
    rules: [{
      when: { phase },
      then: [{
        type: 'exec',
        source: 'state.seenHp = state.player.hp; return { state };'
      }]
    }]
  };
}

describe('game card state schema pipeline', () => {
  beforeEach(() => {
    global.platformMock.readGameCardFile.mockReset();
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: '{"schema":{"player.hp":{"type":"number","default":100}}}'
    });
  });
  test('loads an external schema file before applying pre_send rules', async () => {
    const result = await preparePreSend({
      card: schemaCard(),
      messages: [{ role: 'user', content: 'start' }]
    });

    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('state-card', 'state/schema.json');
    expect(result.applied).toBe(true);
    expect(result.card.state.schema).toEqual({
      schema: { 'player.hp': { type: 'number', default: 100 } }
    });
    expect(result.messages[0]).toEqual({ role: 'system', content: 'rules' });
  });
  test('reports missing schema files without applying rules', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: false,
      error: 'game card file not found'
    });

    const result = await preparePreSend({
      card: schemaCard(),
      messages: [{ role: 'user', content: 'start' }]
    });

    expect(result.applied).toBe(false);
    expect(result.error).toContain('game card file not found');
    expect(result.messages).toEqual([{ role: 'user', content: 'start' }]);
  });
  test('surfaces safe path rejections for schema files', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: false,
      error: 'game card file path must stay inside game card directory'
    });

    const result = await preparePreSend({
      card: schemaCard('../schema.json'),
      messages: [{ role: 'user', content: 'start' }]
    });

    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('state-card', '../schema.json');
    expect(result.applied).toBe(false);
    expect(result.error).toContain('game card file path must stay inside game card directory');
  });

  test('surfaces absolute path rejections for schema files', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: false,
      error: 'game card file path must be relative'
    });

    const result = await prepareAfterResponse({
      card: schemaCard('/tmp/schema.json'),
      messages: [{ role: 'assistant', content: 'done' }]
    });

    expect(result.applied).toBe(false);
    expect(result.error).toContain('game card file path must be relative');
  });

  test('allows cards without state to run unchanged', async () => {
    const card = schemaCard();
    delete card.stateSchema;
    const result = await prepareInit({ card, messages: [] });

    expect(result.applied).toBe(true);
    expect(result.card).toBe(card);
    expect(global.platformMock.readGameCardFile).not.toHaveBeenCalled();
  });

  test('passes through the original state value when no schema exists', async () => {
    const card = schemaCard();
    delete card.stateSchema;
    const state = { route: 'alice' };
    const result = await preparePreSend({
      card,
      messages: [{ role: 'user', content: 'start' }],
      state
    });

    expect(result.state).toEqual(state);
    expect(result.stateTrace).toEqual({ changed: false, changedKeys: [], errors: [] });
  });

  test('pre_send rules receive state after schema defaults are applied', async () => {
    const result = await preparePreSend({
      card: stateExecCard('pre_send'),
      messages: [{ role: 'user', content: 'start' }],
      state: {}
    });

    expect(result.state).toEqual({ player: { hp: 100 }, seenHp: 100 });
    expect(result.stateTrace).toEqual({
      changed: true,
      changedKeys: ['player.hp'],
      errors: []
    });
    expect(result.trace.rules[0].summary.state.changedKeys).toContain('seenHp');
  });

  test('after_response rules receive clamped existing state', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: '{"schema":{"player.hp":{"type":"number","min":0,"max":100,"onInvalid":"clamp"}}}'
    });

    const result = await prepareAfterResponse({
      card: stateExecCard('after_response'),
      messages: [{ role: 'assistant', content: 'done' }],
      state: { player: { hp: 150 } }
    });

    expect(result.state).toEqual({ player: { hp: 100 }, seenHp: 100 });
    expect(result.stateTrace.changedKeys).toEqual(['player.hp']);
  });

  test('init with existing messages only applies schema defaults', async () => {
    const result = await prepareInit({
      card: stateExecCard('init'),
      messages: [{ role: 'user', content: 'loaded' }],
      state: {}
    });

    expect(result.applied).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.messages).toEqual([{ role: 'user', content: 'loaded' }]);
    expect(result.state).toEqual({ player: { hp: 100 } });
    expect(result.trace).toBeNull();
  });

  test('init with existing messages does not preload rule files', async () => {
    const card = stateExecCard('init');
    card.files = { rules: 'worldbook/rules.md' };
    card.rules[0].then = [{ type: 'insert', role: 'system', content: '{{file:rules}}' }];

    await prepareInit({
      card,
      messages: [{ role: 'user', content: 'loaded' }],
      state: {}
    });

    expect(global.platformMock.readGameCardFile).toHaveBeenCalledTimes(1);
    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('state-card', 'state/schema.json');
  });
});
