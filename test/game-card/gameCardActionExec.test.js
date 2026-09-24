const { applyAction } = require('../../src/shared/game-card/engine/actions');
const { applyGameCard } = require('../../src/shared/game-card/engine/engine');

describe('game card action execution edge cases', () => {
  test('remove deletes multiple messages without index offset', () => {
    const messages = [
      { role: 'system', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' }
    ];
    const result = applyAction(messages, { type: 'remove', predicate: { role: 'user' } });
    expect(result.messages).toEqual([
      { role: 'system', content: 'a' },
      { role: 'assistant', content: 'd' }
    ]);
    expect(result.trace.matched).toBe(2);
  });

  test('remove all messages with all predicate', () => {
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' }
    ];
    const result = applyAction(messages, { type: 'remove', predicate: { all: true } });
    expect(result.messages).toEqual([]);
  });

  test('replace modifies only content without touching ttl or _meta', () => {
    const messages = [{
      role: 'system', content: 'old', ttl: 3,
      _meta: { source: 'game_card', visibility: 'llm_only' }
    }];
    const result = applyAction(messages, {
      type: 'replace', predicate: { index: 0 }, content: 'new'
    });
    expect(result.messages).toEqual([{
      role: 'system', content: 'new', ttl: 3,
      _meta: { source: 'game_card', visibility: 'llm_only' }
    }]);
  });

  test('replace modifies only ttl without touching content or _meta', () => {
    const messages = [{
      role: 'system', content: 'rules', ttl: -1,
      _meta: { source: 'game_card' }
    }];
    const result = applyAction(messages, {
      type: 'replace', predicate: { index: 0 }, ttl: 2
    });
    expect(result.messages).toEqual([{
      role: 'system', content: 'rules', ttl: 2,
      _meta: { source: 'game_card' }
    }]);
  });

  test('replace merges _meta without losing existing fields', () => {
    const messages = [{
      role: 'system', content: 'x',
      _meta: { source: 'game_card', visibility: 'llm_only' }
    }];
    const result = applyAction(messages, {
      type: 'replace', predicate: { index: 0 }, content: 'y',
      _meta: { visibility: 'user_visible' }
    });
    expect(result.messages[0]._meta).toEqual({
      source: 'game_card', visibility: 'user_visible'
    });
  });

  test('same rule executes multiple actions in order', () => {
    const card = {
      version: '1', id: 'multi-card', name: 'Multi',
      rules: [{
        when: { phase: 'pre_send' },
        then: [
          { type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system', content: 'first' },
          { type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system', content: 'second' },
          { type: 'replace', predicate: { index: 'last' }, content: 'modified' }
        ]
      }]
    };
    const messages = [{ role: 'user', content: 'hello' }];
    const result = applyGameCard({ card, phase: 'pre_send', messages });
    expect(result.messages.map((m) => m.content)).toEqual(['second', 'first', 'modified']);
    expect(result.trace.rules[0].actions.map(action => action.type)).toEqual(['insert', 'insert', 'replace']);
    expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  test('multiple matched rules execute in config order', () => {
    const card = {
      version: '1', id: 'order-card', name: 'Order',
      rules: [
        { id: 'a', when: { phase: 'pre_send' }, then: [{ type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system', content: 'A' }] },
        { id: 'b', when: { phase: 'pre_send' }, then: [{ type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system', content: 'B' }] },
        { id: 'c', when: { phase: 'pre_send' }, then: [{ type: 'remove', predicate: { all: true } }] }
      ]
    };
    const result = applyGameCard({ card, phase: 'pre_send', messages: [{ role: 'user', content: 'x' }] });
    expect(result.trace.rules.map((r) => r.ruleId)).toEqual(['a', 'b', 'c']);
    expect(result.messages).toEqual([]);
  });

  test('insert does not mutate original messages array', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const result = applyAction(messages, {
      type: 'insert', predicate: { index: 0 }, anchor: 'before',
      role: 'system', content: 'rules',
      _meta: { visibility: 'llm_only' }
    });
    expect(messages.length).toBe(1);
    expect(result.messages.length).toBe(2);
  });

  test.each([undefined, { type: 'unknown_type' }])('applyAction reports unsupported action %p', action => {
    const messages = [{ role: 'user', content: 'hello' }];
    const result = applyAction(messages, action);
    expect(result.messages).toEqual(messages);
    expect(result.trace).toMatchObject({ type: action?.type ?? 'unknown', applied: false, reason: 'not_implemented' });
  });
});
