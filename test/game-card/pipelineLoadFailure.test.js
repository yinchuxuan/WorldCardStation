import * as pipeline from '../../src/renderer/gameCard/sendPipeline.js';

test.each(['prepareInitMessages', 'preparePreSendMessages', 'prepareAfterStreamMessages', 'prepareAfterResponseMessages'])(
  '%s preserves load errors and original data', async name => {
    const messages = [{ role: 'user', content: 'original', ttl: 5 }];
    const state = { score: 7 };
    const error = Object.assign(new Error('cannot read card'), { stage: 'read_json', file: 'card.json', details: [{ message: 'permission denied' }] });
    const result = await pipeline[name]({ messages, state,
      platform: { repository: { getActiveCard: async () => { throw error; } } } });
    expect(result).toMatchObject({ applied: false, error: error.message, stage: error.stage, file: error.file, details: error.details });
    expect(result.messages).toBe(messages);
    expect(result.state).toBe(state);
    expect(result.messages[0].ttl).toBe(5);
  }
);
