const {
  prepareStatePatchAtCursor
} = require('../game-card/legacyPatchHarness.js');

const card = {
  version: '1',
  id: 'state-patch-card',
  name: 'State Patch Card',
  state: {
    schema: {
      'scene.location': {
        type: 'enum',
        values: ['school', 'classroom'],
        default: 'school',
        llmWrite: true
      },
      'visual.portraits': {
        type: 'object',
        properties: { touma: { type: 'enum', values: ['normal', 'sad'] } },
        additionalProperties: false,
        maxProperties: 4,
        default: {}
      },
      score: { type: 'number', default: 0, llmWrite: true }
    }
  }
};

describe('state patch cursor pipeline', () => {
  test('applies every valid action in a cursor-timed patch', async () => {
    const result = await prepareStatePatchAtCursor({
      patchText: JSON.stringify([
        { type: 'state.set', path: 'scene.location', value: 'classroom' },
        { type: 'state.set', path: 'score', value: 9 }
      ]),
      state: { scene: { location: 'school' }, score: 0 },
      messages: [{ role: 'user', content: '继续' }],
      card,
      platform: { resources: {} }
    });

    expect(result.applied).toBe(true);
    expect(result.state.scene.location).toBe('classroom');
    expect(result.state.score).toBe(9);
  });

  test('ignores invalid enum values', async () => {
    const result = await prepareStatePatchAtCursor({
      patchText: '{"type":"state.set","path":"scene.location","value":"unknown"}',
      state: { scene: { location: 'school' } },
      card,
      platform: { resources: {} }
    });

    expect(result.applied).toBe(false);
    expect(result.state.scene.location).toBe('school');
  });

  test('applies a complete cursor-timed patch and reports presentation changes', async () => {
    const result = await prepareStatePatchAtCursor({
      patchText: JSON.stringify([
        { type: 'state.set', path: 'score', value: 9 },
        { type: 'state.set', path: 'visual.scene', value: 'classroom' }
      ]),
      state: {
        scene: { location: 'school' },
        score: 0,
        visual: { scene: 'school' }
      },
      messages: [{ role: 'user', content: '继续' }],
      card,
      platform: { resources: {} }
    });

    expect(result.state.score).toBe(9);
    expect(result.state.visual.scene).toBe('classroom');
    expect(result.presentationChangedKeys).toEqual(['visual.scene']);
  });

  test('does not republish an unchanged portrait object', async () => {
    const state = { visual: { portraits: { touma: 'normal' } } };
    const result = await prepareStatePatchAtCursor({
      patchText: JSON.stringify({
        'visual.portraits': { touma: 'normal' }
      }),
      state,
      card,
      platform: { resources: {} }
    });

    expect(result.applied).toBe(true);
    expect(result.presentationChangedKeys).toEqual([]);
  });

  test('reports a repeated BGM set independently from state changes', async () => {
    const result = await prepareStatePatchAtCursor({
      patchText: JSON.stringify({ 'audio.bgm': 'calm' }),
      state: { audio: { bgm: 'calm' } },
      card,
      platform: { resources: {} }
    });

    expect(result.applied).toBe(true);
    expect(result.presentationChangedKeys).toEqual([]);
    expect(result.patchTrace.setPaths).toEqual(['audio.bgm']);
  });
});
