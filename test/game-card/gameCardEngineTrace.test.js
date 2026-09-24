const { applyGameCard } = require('../../src/shared/game-card/engine/engine');

describe('game card engine trace', () => {
  test('applyGameCard records message summaries and validation errors in trace', () => {
    const card = {
      version: '1',
      id: 'trace-card',
      name: 'Trace Card',
      rules: [
        {
          id: 'insert',
          when: { phase: 'pre_send' },
          then: [{ type: 'insert', predicate: { index: 0 }, role: 'system', content: 'rules' }]
        },
        { id: 'bad-rule', when: { phase: 'pre_send' }, then: [{ type: 'insert' }] }
      ]
    };

    const result = applyGameCard({
      card,
      phase: 'pre_send',
      messages: [{ role: 'user', content: 'hello' }],
      state: { hp: 10 }
    });

    expect(result.state).toEqual({ hp: 10 });
    expect(result.trace.rules).toHaveLength(0);
    expect(result.trace.errors.length).toBeGreaterThan(0);
    expect(result.trace.errors[0]).toMatch('rules[1]');
  });

  test('applyGameCard applies a valid insert and records accurate summary', () => {
    const card = {
      version: '1',
      id: 'summary-card',
      name: 'Summary Card',
      rules: [{
        when: { phase: 'pre_send' },
        then: [{ type: 'insert', predicate: { index: 0 }, role: 'system', content: 'rules' }]
      }]
    };

    const result = applyGameCard({
      card,
      phase: 'pre_send',
      messages: [{ role: 'user', content: 'hello' }],
      state: { hp: 10 }
    });

    expect(result.state).toEqual({ hp: 10 });
    expect(result.trace.rules[0].summary).toEqual({
      messages: { before: 1, after: 2, inserted: 1, removed: 0, replaced: 0 },
      state: { changedKeys: [] }
    });
    expect(result.trace.rules[0].actions[0].summary.messages.inserted).toBe(1);
  });
});
