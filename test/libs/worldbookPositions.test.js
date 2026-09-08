const { user, assistant, entry, book, stBook, runBook, injected, selected } = require('./worldbookTestRuntime');

const anchor = (source, content) => ({ role: 'system', content, _meta: { source } });

describe('worldbook insertion positions', () => {
  test('places before/after character entries around an explicitly registered message range', async () => {
    const result = await runBook(book([
      entry('before', { constant: true, position: 'before_char' }),
      entry('after', { constant: true, position: 'after_char' })
    ], { extensions: { world_card_station: { anchors: { character: ['description', 'scenario'] } } } }), {
      messages: [anchor('system', 'system'), anchor('description', 'description'), anchor('scenario', 'scenario'), user('hello')]
    });
    expect(result.messages.map(message => message.content)).toEqual(['system', 'before', 'description', 'scenario', 'after', 'hello']);
    expect(injected(result).every(message => message.ttl === 1 && message._meta.visibility === 'llm_only')).toBe(true);
  });

  test('supports ST depth roles without counting other injections as chat messages', async () => {
    const result = await runBook(stBook([
      entry('oldest', { constant: true, position: 4, depth: 100, role: 0 }),
      entry('depth-one', { constant: true, extensions: { position: 4, depth: 1, role: 1 } }),
      entry('prefill', { constant: true, extensions: { position: 4, depth: 0, role: 2 } })
    ]), { messages: [anchor('system', 'system'), user('old'), assistant('reply'), user('new')] });
    expect(result.messages.map(message => message.content)).toEqual(['system', 'oldest', 'old', 'reply', 'depth-one', 'new', 'prefill']);
    expect(injected(result).map(message => message.role)).toEqual(['system', 'user', 'assistant']);
  });

  test('places A/N entries around its anchor and ignores them if A/N is absent', async () => {
    const config = stBook([entry('top', { constant: true, position: 2 }), entry('bottom', { constant: true, position: 3 })], {
      extensions: { world_card_station: { format: 'sillytavern', anchors: { authors_note: 'note' } } }
    });
    const result = await runBook(config, { messages: [user('hi'), anchor('note', 'note')] });
    expect(result.messages.map(message => message.content)).toEqual(['hi', 'top', 'note', 'bottom']);
    const absent = await runBook(config);
    expect(selected(absent)).toEqual([]);
    expect(absent.report.warnings[0]).toMatchObject({ code: 'missing_anchor', detail: 'authors_note' });
  });

  test('parses ST example dialogue speakers using the supplied character/persona names', async () => {
    const result = await runBook(stBook([entry('example', {
      constant: true, position: 5, content: '<START>\n{{user}}: Hello\n{{char}}: Hi\nSecond line'
    })], { extensions: { world_card_station: { format: 'sillytavern', anchors: { examples: 'examples' } } } }), {
      messages: [anchor('examples', 'base examples'), user('now')], args: { character: { name: 'Haru' }, user: { name: 'Player' } }
    });
    expect(injected(result).map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi\nSecond line' }
    ]);
    expect(result.messages[2].content).toBe('base examples');
  });

  test('collects outlets without injecting them and clears stale outlet state', async () => {
    const config = stBook([
      entry('later', { position: 7, outletName: 'scene', insertion_order: 20 }),
      entry('earlier', { position: 7, outletName: 'scene', insertion_order: 10 }),
      entry('unnamed', { position: 7 })
    ], { scan_depth: 1 });
    const first = await runBook(config, { state: { score: 5 } });
    expect(injected(first)).toEqual([]);
    expect(first.report.outlets).toEqual({ scene: 'earlier\n\nlater' });
    expect(first.state.__worldbook.worldbook.outlets).toEqual(first.report.outlets);
    const next = await runBook(config, { state: first.state, messages: [user('no match')] });
    expect(next.state.__worldbook.worldbook.outlets).toEqual({});
    expect(next.state.score).toBe(5);
  });

  test('missing character anchors fall back explicitly; unpositioned legacy entries stay before the last user', async () => {
    const result = await runBook(book([entry('legacy'), entry('before', { position: 'before_char' })]));
    expect(injected(result)[0].content).toBe('legacy\n\nbefore');
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'missing_anchor', detail: 'character' }));
    expect(result.messages.at(-1).content).toBe('key');
  });

  test('replaces its scope only, even when two books share the same display name', async () => {
    const first = await runBook(book([entry('first')]), { scope: 'first' });
    const second = await runBook(book([entry('second')]), { scope: 'second', messages: first.messages });
    const replaced = await runBook(book([entry('replaced')]), { scope: 'first', messages: second.messages });
    expect(injected(replaced).map(message => message.content)).toEqual(['second', 'replaced']);
  });
});
