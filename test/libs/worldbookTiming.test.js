const { user, assistant, entry, stBook, v3Book, runBook, selected } = require('./worldbookTestRuntime');

describe('worldbook session-local timed effects', () => {
  test('sticky bypasses later probability, does not refresh, then enters cooldown', async () => {
    const config = stBook([entry('timed', { sticky: 3, cooldown: 2, probability: 50 })], { scan_depth: 1 });
    const history = [user('key')];
    const first = await runBook(config, { messages: history, state: { existing: { value: 1 } }, random: () => 0 });
    expect(selected(first)).toEqual(['timed']);
    history.push(assistant('reply'));
    const sticky = await runBook(config, { messages: history, state: first.state, random: () => 0.99 });
    expect(selected(sticky)).toEqual(['timed']);
    expect(sticky.state.__worldbook.worldbook.entries.timed.stickyUntil).toBe(4);
    history.push(user('key'), assistant('reply'));
    const cooldown = await runBook(config, { messages: history, state: sticky.state, random: () => 0 });
    expect(selected(cooldown)).toEqual([]);
    history.push(user('key'), assistant('reply'), user('key'));
    const expired = await runBook(config, { messages: history, state: cooldown.state, random: () => 0 });
    expect(selected(expired)).toEqual(['timed']);
    expect(expired.state.existing).toEqual({ value: 1 });
  });

  test('delay counts individual messages, not exchanges or worldbook injections', async () => {
    const config = stBook([entry('delayed', { constant: true, extensions: { delay: 2 } })]);
    expect(selected(await runBook(config, { messages: [user('one')] }))).toEqual([]);
    expect(selected(await runBook(config, { messages: [user('one'), assistant('two')] }))).toEqual(['delayed']);
  });

  test('sticky wins inclusion groups before matching-key scoring or override', async () => {
    const config = stBook([
      entry('sticky', { sticky: 5, group: 'g' }),
      entry('override', { keys: ['other'], group: 'g', groupOverride: true, insertion_order: 200 })
    ], { scan_depth: 1 });
    const first = await runBook(config);
    const second = await runBook(config, { messages: [user('key'), assistant('other')], state: first.state });
    expect(selected(second)).toEqual(['sticky']);
  });

  test('does not start timers on probability, group, or budget losers', async () => {
    const result = await runBook(stBook([
      entry('probability', { sticky: 2, probability: 0 }),
      entry('winner', { content: 'ok', group: 'g', groupOverride: true }),
      entry('group', { sticky: 2, group: 'g' }), entry('budget', { sticky: 2, content: 'too long' })
    ], { token_budget: 1 }));
    expect(selected(result)).toEqual(['winner']);
    for (const value of Object.values(result.state.__worldbook.worldbook.entries)) {
      expect(value.matches).toBe(0);
      expect(value.stickyUntil).toBe(0);
    }
  });

  test('clears timed effects when history is swiped, deleted, or does not advance', async () => {
    const config = stBook([entry('timed', { sticky: 5, probability: 50 })], { scan_depth: 1 });
    const first = await runBook(config, { random: () => 0 });
    expect(selected(await runBook(config, { state: first.state, random: () => 0.99 }))).toEqual([]);
    expect(selected(await runBook(config, { state: first.state, messages: [] }))).toEqual([]);
    expect(selected(await runBook(config, { state: first.state, messages: [user('edited'), assistant('reply')] }))).toEqual([]);
  });

  test('invalidates an active timer if its Markdown changes', async () => {
    const config = stBook([entry('timed', {
      sticky: 5, extensions: { world_card_station: { content_file: 'entries/body.md', decorators: [] } }
    })], { scan_depth: 1 });
    const first = await runBook(config, { files: { 'worldbook/entries/body.md': 'old' } });
    const next = await runBook(config, {
      messages: [user('key'), assistant('no match')], state: first.state, files: { 'worldbook/entries/body.md': 'edited' }
    });
    expect(selected(next)).toEqual([]);
  });

  test('isolates fresh sessions and books; persisted state restores in a new runtime', async () => {
    const config = stBook([entry('__proto__', { sticky: 5 })], { scan_depth: 1 });
    const first = await runBook(config);
    const messages = [user('key'), assistant('reply')];
    const restored = await runBook(config, { messages, state: JSON.parse(JSON.stringify(first.state)) });
    expect(selected(restored)).toEqual(['__proto__']);
    expect(selected(await runBook(config, { messages, state: first.state, scope: 'other' }))).toEqual([]);
    expect(selected(await runBook(config, { messages }))).toEqual([]);
    expect(Object.prototype.matches).toBeUndefined();
  });

  test('V3 remembers distinct matches without double-counting retries', async () => {
    const config = v3Book([
      entry('keep', { content: '@@keep_activate_after_match\nkeep' }),
      entry('once', { content: '@@dont_activate_after_match\nonce' })
    ], { scan_depth: 1 });
    const first = await runBook(config);
    const retry = await runBook(config, { state: first.state });
    expect(retry.state.__worldbook.worldbook.entries.keep.matches).toBe(1);
    const second = await runBook(config, { state: retry.state, messages: [user('key'), assistant('key')] });
    const next = await runBook(config, { state: second.state, messages: [user('key'), assistant('key'), user('no match')] });
    expect(selected(next)).toEqual(['keep']);
  });
});
