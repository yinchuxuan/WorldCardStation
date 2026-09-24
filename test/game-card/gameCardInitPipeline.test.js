const { prepareInitMessages } = require('../game-card/legacyPipelineHarness.js');

function initCard() {
  return {
    version: '1',
    id: 'init-card',
    name: 'Init Card',
    rules: [{
      when: { phase: 'init', length: 0 },
      then: [{ type: 'insert', role: 'system', content: 'intro', _meta: { source: 'game_card_init' } }]
    }]
  };
}

describe('game card init pipeline', () => {
  test('applies init rules only for empty loaded histories', async () => {
    const initialized = await prepareInitMessages({ messages: [], card: initCard() });
    const skipped = await prepareInitMessages({ messages: initialized.messages, card: initCard() });

    expect(initialized.applied).toBe(true);
    expect(initialized.changed).toBe(true);
    expect(initialized.messages).toEqual([
      { role: 'system', content: 'intro', _meta: { source: 'game_card_init' } }
    ]);
    expect(skipped.applied).toBe(false);
    expect(skipped.changed).toBe(false);
    expect(skipped.messages).toBe(initialized.messages);
  });
});
