const Ajv = require('ajv');
const schema = require('../../src/shared/game-card/schema/game-card.schema.json');
const {
  prepareAfterResponseMessages,
  preparePreSendMessages
} = require('../game-card/legacyPipelineHarness.js');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');

const platform = createTestGameCardPlatform(() => global.platformMock);

function card(phase, then, presentation) {
  return {
    version: '1',
    id: 'presentation-card',
    name: 'Presentation Card',
    presentation,
    rules: [{ when: { phase }, then }]
  };
}

describe('game card presentation actions', () => {
  test('schema accepts update actions and first-token opt-out', () => {
    const validate = new Ajv({
      $data: true,
      allErrors: true,
      strict: false
    }).compile(schema);
    expect(validate(card('pre_send', [
      { type: 'visual.updateBackground' },
      { type: 'visual.updatePortrait' },
      { type: 'audio.updateBgm' }
    ], { autoUpdateOnFirstToken: false }))).toBe(true);
  });

  test('schema rejects unsupported presentation fields', () => {
    const validate = new Ajv({
      $data: true,
      allErrors: true,
      strict: false
    }).compile(schema);
    expect(validate(card('pre_send', [
      { type: 'visual.updateBackground', restart: true }
    ]))).toBe(false);
    expect(validate(card('pre_send', [
      { type: 'audio.updateBgm', restart: false }
    ]))).toBe(false);
  });

  test('pre_send returns ordered presentation effects without changing state', async () => {
    const state = {
      visual: { scene: 'school', portraits: { touma: 'normal' } },
      audio: { bgm: 'intro' }
    };
    const result = await preparePreSendMessages({
      messages: [],
      state,
      card: card('pre_send', [
        { type: 'visual.updateBackground' },
        { type: 'visual.updatePortrait' },
        { type: 'audio.updateBgm' }
      ]),
      platform
    });

    expect(result.state).toEqual(state);
    expect(result.presentationEffects).toEqual([
      { type: 'visual.updateBackground' },
      { type: 'visual.updatePortrait' },
      { type: 'audio.updateBgm' }
    ]);
  });

  test('after_response exposes nested conditional presentation effects', async () => {
    const result = await prepareAfterResponseMessages({
      messages: [{ role: 'assistant', content: 'done' }],
      state: { ready: true },
      card: card('after_response', [{
        when: { state: { ready: true } },
        then: [{ type: 'visual.updatePortrait' }]
      }]),
      platform
    });

    expect(result.presentationEffects).toEqual([
      { type: 'visual.updatePortrait' }
    ]);
  });
});
