const {
  preparePreSendMessages,
  prepareState
} = require('../game-card/legacyPipelineHarness.js');
const {
  mergeRuntimeStateSchema
} = require('../../src/shared/game-card/schema/runtimeStateSchema');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');

const platform = createTestGameCardPlatform(() => global.platformMock);

function visualCard() {
  return {
    version: '1',
    id: 'visual-state-card',
    name: 'Visual State Card',
    stateSchema: 'state/schema.json',
    visual: {
      background: { school: 'images/school.jpg', night: 'images/night.png' },
      cg: { confession: 'images/confession.png' },
      portrait: {
        touma: { normal: 'images/touma.png', happy: 'images/touma-happy.png' },
        setsuna: { normal: 'images/setsuna.webp' }
      }
    },
    rules: [{
      when: { phase: 'pre_send' },
      then: [
        { type: 'state.set', path: 'visual.scene', value: 'night' },
        { type: 'state.set', path: 'visual.portraits', value: { touma: 'happy' } }
      ]
    }]
  };
}

describe('game card visual state schema', () => {
  beforeEach(() => {
    global.platformMock.readGameCardFile.mockReset();
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: '{"schema":{"player.hp":{"type":"number","default":100}}}'
    });
  });

  test('derives and applies visual state schema', async () => {
    const result = await preparePreSendMessages({
      card: visualCard(),
      messages: [{ role: 'user', content: 'start' }],
      state: {},
      platform
    });

    expect(result.card.state.schema.schema['visual.scene']).toMatchObject({
      type: 'enum',
      values: ['school', 'night', 'confession'],
      default: 'school',
      llmRead: false,
      llmWrite: false
    });
    expect(result.card.state.schema.schema['visual.textPanel']).toMatchObject({
      type: 'enum',
      values: ['center', 'left', 'right'],
      default: 'center',
      llmRead: false,
      llmWrite: false
    });
    expect(result.card.state.schema.schema['visual.portraits']).toMatchObject({
      type: 'object',
      properties: {
        touma: { type: 'enum', values: ['normal', 'happy'] },
        setsuna: { type: 'enum', values: ['normal'] }
      },
      additionalProperties: false,
      maxProperties: 4,
      default: {},
      llmRead: false,
      llmWrite: false
    });
    expect(result.state.visual.scene).toBe('night');
    expect(result.state.visual.portraits).toEqual({ touma: 'happy' });
    expect(result.state.visual.textPanel).toBe('center');
    expect(result.stateTrace.changedKeys).toContain('visual.scene');
    expect(result.stateTrace.changedKeys).toContain('visual.portraits');
    expect(result.stateTrace.changedKeys).toContain('visual.textPanel');
  });

  test('migrates a legacy single portrait state', () => {
    const runtimeCard = mergeRuntimeStateSchema(visualCard());
    const result = prepareState(runtimeCard, {
      visual: { portrait: 'touma_happy' }
    });

    expect(result.state.visual).toMatchObject({
      portraits: { touma: 'happy' },
      scene: 'school'
    });
    expect(result.state.visual).not.toHaveProperty('portrait');
    expect(result.trace.changedKeys).toContain('visual.portraits');
  });
});
