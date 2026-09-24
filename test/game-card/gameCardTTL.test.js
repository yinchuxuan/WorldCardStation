const { decayTTL } = require('../../src/shared/game-card/engine/ttl');
const { applyGameCard } = require('../../src/shared/game-card/engine/engine');

describe('TTL edge cases', () => {
  test('ttl: -1 keeps messages permanent with no decay', () => {
    const messages = [
      { role: 'system', content: 'permanent', ttl: -1 },
      { role: 'system', content: 'permanent2', ttl: -1 }
    ];
    const result = decayTTL(messages);
    expect(result.messages).toEqual(messages);
    expect(result.trace.summary.messages.decayed).toBe(0);
    expect(result.trace.summary.messages.removed).toBe(0);
  });

  test('messages without ttl are kept unchanged', () => {
    const messages = [
      { role: 'user', content: 'no ttl' },
      { role: 'assistant', content: 'also no ttl' }
    ];
    const result = decayTTL(messages);
    expect(result.messages).toEqual(messages);
    expect(result.trace.summary.messages.decayed).toBe(0);
  });

  test('ttl: 1 causes removal after decay', () => {
    const messages = [
      { role: 'system', content: 'dies', ttl: 1 },
      { role: 'user', content: 'stays' }
    ];
    const result = decayTTL(messages);
    expect(result.messages).toEqual([{ role: 'user', content: 'stays' }]);
    expect(result.trace.summary.messages.removed).toBe(1);
  });

  test('ttl > 1 decays by one each call', () => {
    const messages = [{ role: 'system', content: 'temp', ttl: 3 }];
    const r1 = decayTTL(messages);
    expect(r1.messages).toEqual([{ role: 'system', content: 'temp', ttl: 2 }]);
    const r2 = decayTTL(r1.messages);
    expect(r2.messages).toEqual([{ role: 'system', content: 'temp', ttl: 1 }]);
    const r3 = decayTTL(r2.messages);
    expect(r3.messages).toEqual([]);
  });

  test('ttl: 0 causes immediate removal', () => {
    const messages = [{ role: 'system', content: 'gone', ttl: 0 }];
    const result = decayTTL(messages);
    expect(result.messages).toEqual([]);
    expect(result.trace.summary.messages.removed).toBe(1);
  });

  test('invalid ttl string keeps message and records error', () => {
    const result = decayTTL([{ role: 'system', content: 'bad', ttl: 'soon' }]);
    expect(result.messages).toEqual([{ role: 'system', content: 'bad', ttl: 'soon' }]);
    expect(result.trace.errors).toEqual(['message ttl must be a number']);
  });

  test('invalid ttl float keeps message and records error', () => {
    const result = decayTTL([{ role: 'system', content: 'bad', ttl: 1.5 }]);
    expect(result.messages).toEqual([{ role: 'system', content: 'bad', ttl: 1.5 }]);
    expect(result.trace.errors).toEqual(['message ttl must be a number']);
  });

  test('mixed ttl values in same batch', () => {
    const messages = [
      { role: 'system', content: 'a', ttl: -1 },
      { role: 'system', content: 'b', ttl: 2, _meta: { source: 'game_card' } },
      { role: 'system', content: 'c', ttl: 1 },
      { role: 'system', content: 'd' },
      { role: 'system', content: 'e', ttl: 0 },
      { role: 'system', content: 'f', ttl: 'bad' }
    ];
    const result = decayTTL(messages);
    expect(result.messages.map((m) => m.content)).toEqual(['a', 'b', 'd', 'f']);
    expect(result.messages.find((m) => m.content === 'b').ttl).toBe(1);
    expect(result.trace).toEqual({
      phase: 'ttl_decay',
      summary: { messages: { before: 6, after: 4, decayed: 1, removed: 2 }, state: { changedKeys: [] } },
      errors: ['message ttl must be a number']
    });
    expect(result.messages[1]._meta).toEqual({ source: 'game_card' });
    result.messages[1]._meta.source = 'changed';
    expect(messages[1]).toEqual({ role: 'system', content: 'b', ttl: 2, _meta: { source: 'game_card' } });
  });

  test('ttl decay through engine after_response phase', () => {
    const card = {
      version: '1', id: 'ttl-card', name: 'TTL',
      rules: [{
        when: { phase: 'after_response', last: { role: 'assistant' } },
        then: [
          { type: 'insert', predicate: { index: 'last' }, anchor: 'after', role: 'system', content: 'temp', ttl: 1 }
        ]
      }]
    };
    const result = applyGameCard({
      card, phase: 'after_response',
      messages: [{ role: 'assistant', content: 'reply' }]
    });
    expect(result.messages.map((m) => m.content)).toEqual(['reply', 'temp']);
  });

  test('decayTTL handles non-array input', () => {
    const result = decayTTL(null);
    expect(result.messages).toEqual([]);
  });

  test('ttl: -2 is invalid in schema but runtime treats as removed', () => {
    const result = decayTTL([{ role: 'system', content: 'neg', ttl: -2 }]);
    expect(result.messages).toEqual([]);
    expect(result.trace.summary.messages.removed).toBe(1);
  });
});
