const { preparePreSendMessages } = require('../game-card/legacyPipelineHarness.js');

test('pre_send rule errors block the request pipeline', async () => {
  const messages = [{ role: 'user', content: 'start' }];
  const result = await preparePreSendMessages({
    messages,
    card: {
      version: '1',
      id: 'invalid-content-card',
      name: 'Invalid Content Card',
      rules: [{
        when: { phase: 'pre_send' },
        then: [{ type: 'insert', predicate: { index: 0 }, role: 'system', content: '{{unknown_source:rules}}' }]
      }]
    }
  });

  expect(result.error).toContain('unsupported content source: unknown_source:rules');
  expect(result.trace.errors).toContain('rule[0] then: unsupported content source: unknown_source:rules');
  expect(result.messages).toEqual(messages);
});
