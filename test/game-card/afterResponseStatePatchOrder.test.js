const { prepareAfterResponseMessages } = require('../game-card/legacyPipelineHarness.js');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');

const platform = createTestGameCardPlatform(() => global.platformMock);
const card = {
  version: '1',
  id: 'patch-order-card',
  name: 'Patch Order Card',
  state: {
    schema: {
      schema: {
        'scene.location': {
          type: 'enum',
          values: ['school', 'classroom'],
          default: 'school',
          llmWrite: true
        },
        'visual.scene': {
          type: 'enum',
          values: ['school', 'classroom'],
          default: 'school'
        }
      }
    }
  },
  rules: [{
    when: { phase: 'after_response', state: { 'scene.location': 'classroom' } },
    then: [{ type: 'state.set', path: 'visual.scene', value: 'classroom' }]
  }]
};

test('commits assistant state patches before after_response rules', async () => {
  const messages = [{
    role: 'assistant',
    content: '<state_patch>{"type":"state.set","path":"scene.location","value":"classroom"}</state_patch>'
  }];
  const result = await prepareAfterResponseMessages({ messages, state: {}, card, platform });

  expect(result.state.scene.location).toBe('classroom');
  expect(result.state.visual.scene).toBe('classroom');
  expect(result.statePatchTrace.applied).toBe(true);
});
