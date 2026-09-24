const {
  prepareAfterResponseMessages,
  prepareAfterStreamMessages
} = require('../game-card/legacyPipelineHarness.js');

function phaseCard() {
  return {
    version: '1', id: 'stream-phase', name: 'Stream Phase',
    rules: [
      { when: { phase: 'after_stream' }, then: [
        { type: 'state.set', path: 'streamEnded', value: true }
      ] },
      { when: { phase: 'after_response' }, then: [
        { type: 'state.set', path: 'responseCommitted', value: true }
      ] }
    ]
  };
}

describe('game card after_stream phase', () => {
  test('runs when the assistant stream ends without running after_response', async () => {
    const messages = [{ role: 'assistant', content: 'complete response' }];
    const streamed = await prepareAfterStreamMessages({ messages, state: {}, card: phaseCard() });

    expect(streamed.state).toEqual({ streamEnded: true });
    expect(streamed.messages).toEqual(messages);
    expect(streamed.trace.errors).toEqual([]);
    expect(streamed.trace.rules[0].ruleId).toBeUndefined();

    const committed = await prepareAfterResponseMessages({
      messages: streamed.messages, state: streamed.state, card: phaseCard(),
      statePatchesApplied: true
    });
    expect(committed.state).toEqual({ streamEnded: true, responseCommitted: true });
  });
});
