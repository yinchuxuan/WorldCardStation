const { user, entry, book, stBook, runBook, selected } = require('./worldbookTestRuntime');

describe('worldbook groups, recursion and budget', () => {
  test('selects inclusion groups by weight, override order, and matching-key score', async () => {
    const entries = [
      entry('zero', { group: 'weighted', groupWeight: 0 }), entry('weighted', { group: 'weighted', groupWeight: 100 }),
      entry('low', { group: 'override', groupOverride: true, insertion_order: 10 }),
      entry('high', { group: 'override', groupOverride: true, insertion_order: 20 }),
      entry('general', { group: 'scoring', useGroupScoring: true, groupOverride: true, insertion_order: 200 }),
      entry('specific', { group: 'scoring', useGroupScoring: true, keys: ['key', 'specific'] })
    ];
    const result = await runBook(stBook(entries), { messages: [user('key specific')] });
    expect(selected(result)).toEqual(['high', 'weighted', 'specific']);
  });

  test('scoring honors secondary logic and per-entry opt-out', async () => {
    const result = await runBook(stBook([
      entry('score', { group: 'g', useGroupScoring: true, selective: true, secondary_keys: ['red', 'wing'], selectiveLogic: 3 }),
      entry('opt-out', { group: 'g', useGroupScoring: false, groupOverride: true })
    ]), { messages: [user('key red wing')] });
    expect(selected(result)).toEqual(['opt-out']);
  });

  test('a multi-group winner excludes all overlapping entries, without excluding unrelated groups', async () => {
    const result = await runBook(stBook([
      entry('both', { group: 'a,b', groupOverride: true }), entry('a', { group: 'a' }),
      entry('b', { group: 'b' }), entry('c', { group: 'c' })
    ]));
    expect(selected(result)).toEqual(['both', 'c']);
  });

  test('supports fractional weights and never selects a zero-total group', async () => {
    const result = await runBook(stBook([
      entry('zero', { group: 'empty', groupWeight: 0 }),
      entry('left', { group: 'g', groupWeight: 0.5 }), entry('right', { group: 'g', groupWeight: 1.5 })
    ]), { random: () => 0.9 });
    expect(selected(result)).toEqual(['right']);
  });

  test('recursion combines history with accepted content and terminates cycles', async () => {
    const result = await runBook(stBook([
      entry('start', { content: 'next', preventRecursion: false }),
      entry('next', { keys: ['next'], selective: true, secondary_keys: ['key'], content: 'key' })
    ], { recursive_scanning: true }));
    expect(selected(result)).toEqual(['start', 'next']);
  });

  test('obeys prevent/exclude recursion, disabled recursion, and numeric delayed levels', async () => {
    const entries = [
      entry('start', { content: 'next' }), entry('excluded', { keys: ['next'], extensions: { exclude_recursion: true } }),
      entry('delayed-low', { constant: true, content: 'trigger', extensions: { delay_until_recursion: 2 } }),
      entry('delayed-high', { keys: ['trigger'], extensions: { delay_until_recursion: 100 } })
    ];
    expect(selected(await runBook(stBook(entries, { recursive_scanning: true })))).toEqual(['start', 'delayed-low', 'delayed-high']);
    expect(selected(await runBook(stBook(entries, { recursive_scanning: false })))).toEqual(['start']);
    const prevented = await runBook(stBook([entry('start', { content: 'next', preventRecursion: true }),
      entry('next', { keys: ['next'] })], { recursive_scanning: true }));
    expect(selected(prevented)).toEqual(['start']);
  });

  test('budget and group losers cannot activate recursive dependents', async () => {
    const result = await runBook(stBook([
      entry('large', { content: 'secret secret secret', insertion_order: 200 }),
      entry('winner', { content: 'ok', group: 'g', groupOverride: true }),
      entry('loser', { content: 'secret', group: 'g' }),
      entry('dependent', { keys: ['secret'], content: 'bad', ignoreBudget: true })
    ], { recursive_scanning: true, token_budget: 1 }));
    expect(selected(result)).toEqual(['winner']);
    expect(result.report.budget_skipped).toEqual(['large']);
  });

  test('does not reroll probability during recursion; useProbability=false bypasses it', async () => {
    const random = jest.fn(() => 0.8);
    const result = await runBook(stBook([
      entry('chance', { probability: 20, useProbability: true }),
      entry('start', { content: 'key next', probability: 0, useProbability: false }),
      entry('next', { keys: ['next'] })
    ], { recursive_scanning: true }), { random });
    expect(selected(result)).toEqual(['start', 'next']);
    expect(random).toHaveBeenCalledTimes(1);
  });

  test('zero budget only allows ignore_budget; CJK costs are not divided by four', async () => {
    const entries = [entry('cjk', { content: '世界书', priority: 200 }), entry('ascii', { content: 'text' }),
      entry('free', { content: 'free', extensions: { ignore_budget: true } })];
    expect(selected(await runBook(book(entries, { token_budget: 0 })))).toEqual(['free']);
    expect(selected(await runBook(book(entries, { token_budget: 2 })))).toEqual(['ascii', 'free']);
  });

  test('reports the recursion cap and keeps insertion order stable on priority ties', async () => {
    const result = await runBook(book([
      entry('one', { content: 'two' }), entry('two', { keys: ['two'], content: 'three' }),
      entry('three', { keys: ['three'] })
    ], { recursive_scanning: true, max_recursion_steps: 2 }));
    expect(selected(result)).toEqual(['one', 'two']);
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'recursion_limit' }));
  });
});
