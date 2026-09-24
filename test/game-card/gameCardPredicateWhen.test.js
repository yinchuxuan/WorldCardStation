const { compareNumber, matchesPredicate, matchesWhen } = require('../../src/shared/game-card/engine/predicate');

describe('predicate and when condition edge cases', () => {
  test('numeric comparisons reject unsupported operators and invalid conditions', () => {
    expect([
      compareNumber(2, 2), compareNumber(2, 3),
      compareNumber(2, { gt: 1, gte: 2, lt: 3, lte: 2, eq: 2 }),
      compareNumber(2, { gt: 2 }), compareNumber(2, { unknown: 2 }), compareNumber(2, null)
    ]).toEqual([true, false, true, false, false, false]);
  });

  test('when requires a matching phase', () => {
    expect([
      matchesWhen(null, 'pre_send', []),
      matchesWhen({ phase: 'after_response' }, 'pre_send', []),
      matchesWhen({ phase: 'pre_send' }, 'pre_send', [])
    ]).toEqual([false, false, true]);
  });

  test('when phase AND length AND last uses AND semantic', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const when = {
      phase: 'pre_send',
      length: 1,
      last: { role: 'user', content: { contains: 'hello' } }
    };
    expect(matchesWhen(when, 'pre_send', messages)).toBe(true);
    expect(matchesWhen({ ...when, length: 2 }, 'pre_send', messages)).toBe(false);
    expect(matchesWhen({ ...when, last: { role: 'assistant' } }, 'pre_send', messages)).toBe(false);
  });

  test('when phase AND any AND all uses AND semantic', () => {
    const messages = [
      { role: 'user', content: 'start quest' },
      { role: 'assistant', content: 'quest accepted' }
    ];
    const when = {
      phase: 'after_response',
      any: { role: 'user' },
      all: { role: { in: ['user', 'assistant'] } }
    };
    expect(matchesWhen(when, 'after_response', messages)).toBe(true);
    expect(matchesWhen({ ...when, all: { role: 'user' } }, 'after_response', messages)).toBe(false);
  });

  test('when combines length last any all with AND semantic', () => {
    const messages = [
      { role: 'user', content: 'start' },
      { role: 'assistant', content: 'reply' }
    ];
    expect(matchesWhen({
      phase: 'after_response',
      length: { gte: 2 },
      last: { role: 'assistant' },
      any: { content: { contains: 'start' } },
      all: { content: { regex: '^[a-z]+$' } }
    }, 'after_response', messages)).toBe(true);
  });

  test('when last.num matches any message in recent range', () => {
    const messages = [
      { role: 'user', content: 'old stranger feeling' },
      { role: 'assistant', content: 'reply' },
      { role: 'system', content: 'hint' },
      { role: 'user', content: 'plain' }
    ];
    expect(matchesWhen({
      phase: 'pre_send',
      last: {
        num: 3,
        role: { in: ['user', 'assistant'] },
        content: { contains: 'reply' }
      }
    }, 'pre_send', messages)).toBe(true);
    expect(matchesWhen({
      phase: 'pre_send',
      last: { num: 3, content: { contains: 'old stranger' } }
    }, 'pre_send', messages)).toBe(false);
  });

  test('when last.num requires positive num and a predicate', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    expect(matchesWhen({ phase: 'pre_send', last: { num: 1 } }, 'pre_send', messages)).toBe(false);
    expect(matchesWhen({ phase: 'pre_send', last: { num: 0, role: 'user' } }, 'pre_send', messages)).toBe(false);
  });

  test('empty messages with index 0 and index last', () => {
    const messages = [];
    expect(matchesPredicate({ index: 0 }, { role: 'user', content: 'x' }, 0, messages)).toBe(true);
    expect(matchesPredicate({ index: 'last' }, { role: 'user', content: 'x' }, 0, messages)).toBe(false);
  });

  test('single message index 0 and index last both match', () => {
    const messages = [{ role: 'user', content: 'only' }];
    expect(matchesPredicate({ index: 0 }, messages[0], 0, messages)).toBe(true);
    expect(matchesPredicate({ index: 'last' }, messages[0], 0, messages)).toBe(true);
  });

  test('multi-message index 0 and index last differ', () => {
    const messages = [
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'reply' }
    ];
    expect(matchesPredicate({ index: 0 }, messages[0], 0, messages)).toBe(true);
    expect(matchesPredicate({ index: 'last' }, messages[0], 0, messages)).toBe(false);
    expect(matchesPredicate({ index: 'last' }, messages[2], 2, messages)).toBe(true);
    expect(matchesPredicate({ index: 0 }, messages[2], 2, messages)).toBe(false);
  });

  test('role content.in content.nin content.not predicates', () => {
    const msg = { role: 'user', content: 'hello world' };
    expect(matchesPredicate({ content: { in: ['hello', 'bye'] } }, msg, 0, [msg])).toBe(false);
    expect(matchesPredicate({ content: { in: ['hello world', 'bye'] } }, msg, 0, [msg])).toBe(true);
    expect(matchesPredicate({ content: { nin: ['goodbye'] } }, msg, 0, [msg])).toBe(true);
    expect(matchesPredicate({ content: { nin: ['hello world'] } }, msg, 0, [msg])).toBe(false);
    expect(matchesPredicate({ not: { role: 'system' } }, msg, 0, [msg])).toBe(true);
  });

  test('multi-key predicate uses implicit AND', () => {
    const msg = { role: 'user', content: 'hello' };
    expect(matchesPredicate({ role: 'user', content: { contains: 'hello' } }, msg, 0, [msg])).toBe(true);
    expect(matchesPredicate({ role: 'user', content: { contains: 'bye' } }, msg, 0, [msg])).toBe(false);
    expect(matchesPredicate({ role: 'assistant', content: { contains: 'hello' } }, msg, 0, [msg])).toBe(false);
  });

  test('_meta.visibility predicate matching', () => {
    const messages = [
      { role: 'system', content: 'visible', _meta: { visibility: 'user_visible' } },
      { role: 'system', content: 'hidden', _meta: { visibility: 'llm_only' } }
    ];
    expect(matchesPredicate({ '_meta.source': 'game_card' }, messages[0], 0, messages)).toBe(false);
    expect(matchesPredicate({ '_meta.source': { in: ['user'] } }, messages[0], 0, messages)).toBe(false);
  });

  test('invalid regex returns false without throwing', () => {
    const msg = { role: 'user', content: 'hello' };
    expect(matchesPredicate({ content: { regex: '[invalid' } }, msg, 0, [msg])).toBe(false);
    expect(matchesWhen({
      phase: 'pre_send',
      last: { content: { regex: '[bad' } }
    }, 'pre_send', [msg])).toBe(false);
  });

  test('matches role-relative occurrence without executing scripts', () => {
    const messages = [
      { role: 'assistant', content: 'old' },
      { role: 'user', content: 'next' },
      { role: 'assistant', content: 'latest' }
    ];
    expect(matchesPredicate({ role: 'assistant', occurrence: 'not_last' }, messages[0], 0, messages)).toBe(true);
    expect(matchesPredicate({ role: 'assistant', occurrence: 'last' }, messages[2], 2, messages)).toBe(true);
  });

});
