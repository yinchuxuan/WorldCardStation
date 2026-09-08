const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');

function cardWithRule(rule) {
  return { version: '1', id: 'find-scope', name: 'Find Scope', rules: [rule] };
}

describe.each([
  ['sync', applyGameCard],
  ['async', applyGameCardAsync]
])('%s find state scoping', (_name, apply) => {
  test('action find shadows rule find, then restores the rule and saved state', async () => {
    const card = cardWithRule({
      when: { phase: 'pre_send' },
      find: [{ name: 'text', from: { role: 'assistant' } }],
      then: [
        {
          type: 'insert', role: 'system',
          find: [{ name: 'text', from: { role: 'user' } }],
          content: '{{state:temp.find.text}}'
        },
        { type: 'exec', source: 'state.captured = state.temp.find.text; return { state };' },
        { type: 'insert', role: 'system', content: '{{state:temp.find.text}}' }
      ]
    });
    const state = { temp: { find: { text: 'saved', other: 'retained' } } };
    const messages = [{ role: 'assistant', content: 'rule' }, { role: 'user', content: 'action' }];
    const result = await apply({ card, phase: 'pre_send', state, messages });

    expect(result.trace.errors).toEqual([]);
    expect(result.messages.slice(2).map(message => message.content)).toEqual(['action', 'rule']);
    expect(result.state).toEqual({ ...state, captured: 'rule' });
    expect(state).toEqual({ temp: { find: { text: 'saved', other: 'retained' } } });
  });

  test.each(['rule', 'action'])('rejects object find at %s level before executing actions', async level => {
    const action = { type: 'insert', role: 'system', content: 'must not run' };
    const rule = { when: { phase: 'pre_send' }, then: [action] };
    (level === 'rule' ? rule : action).find = { text: { from: { role: 'user' } } };
    const messages = [{ role: 'user', content: 'unchanged' }];
    const state = { retained: true };
    const result = await apply({ card: cardWithRule(rule), phase: 'pre_send', messages, state });

    expect(result.trace.errors).toContain(
      `${level === 'rule' ? 'rules[0]' : 'rules[0].then[0]'}.find: must be array`
    );
    expect(result.trace.rules).toEqual([]);
    expect(result.messages).toEqual(messages);
    expect(result.state).toEqual(state);
  });
});
