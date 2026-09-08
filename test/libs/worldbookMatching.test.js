const { user, assistant, entry, book, stBook, v3Book, runBook, selected, injected } = require('./worldbookTestRuntime');

describe('worldbook Tavern field and matching compatibility', () => {
  test('recognizes actual ST character_book exports and reads nested extensions', async () => {
    const config = book([entry('export', {
      keys: ['A.B'], secondary_keys: ['red', 'wing'], selective: true, use_regex: true,
      case_sensitive: false, position: 'after_char',
      extensions: { position: 4, role: 1, depth: 0, case_sensitive: true, selectiveLogic: 3, probability: 100, useProbability: true }
    })]);
    const miss = await runBook(config, { messages: [user('AxB red wing')] });
    const secondaryMiss = await runBook(config, { messages: [user('A.B red')] });
    const hit = await runBook(config, { messages: [user('A.B red wing')] });
    expect(selected(miss)).toEqual([]);
    expect(selected(secondaryMiss)).toEqual([]);
    expect(hit.messages.at(-1)).toMatchObject({ role: 'user', content: 'export', ttl: 1 });
  });

  test.each([[0, 'red', true], [0, 'none', false], [1, 'red', true], [1, 'red wing', false],
    [2, 'none', true], [2, 'wing', false], [3, 'red wing', true], [3, 'red', false]])(
    'ST selectiveLogic %s with %s matches %s', async (logic, text, expected) => {
      const result = await runBook(stBook([entry('filter', {
        secondary_keys: ['red', 'wing'], selective: true, use_regex: true, extensions: { selectiveLogic: logic }
      })]), { messages: [user(`key ${text}`)] });
      expect(selected(result).length > 0).toBe(expected);
    }
  );

  test('inherits null overrides, supports whole-word and multiword keys', async () => {
    const result = await runBook(stBook([
      entry('whole', { keys: ['cat'], extensions: { match_whole_words: null, case_sensitive: null } }),
      entry('substring', { keys: ['cat'], extensions: { match_whole_words: false } }),
      entry('phrase', { keys: ['black cat'], extensions: { match_whole_words: true } })
    ], { case_sensitive: false, match_whole_words: true }), { messages: [user('black CATS')] });
    expect(selected(result)).toEqual(['substring', 'phrase']);
  });

  test('explicit regex flags override case settings and reset global regex state', async () => {
    const result = await runBook(stBook([
      entry('sensitive', { keys: ['/Dragon/'], case_sensitive: false }),
      entry('insensitive', { keys: ['/Dragon/ig'], case_sensitive: true }),
      entry('invalid', { keys: ['/[/'] })
    ]), { messages: [user('dragon dragon')] });
    expect(selected(result)).toEqual(['insensitive']);
  });

  test('V3 regex ignores secondary keys and constant, but false means literal keys', async () => {
    const result = await runBook(v3Book([
      entry('regex', { keys: ['^key'], use_regex: true, selective: true, secondary_keys: ['absent'] }),
      entry('constant', { keys: ['absent'], use_regex: true, constant: true }),
      entry('literal', { keys: ['/key/'], use_regex: false }),
      entry('invalid', { keys: ['[', 'key'], use_regex: true })
    ]));
    expect(selected(result)).toEqual(['regex']);
    expect(result.report.warnings).toContainEqual(expect.objectContaining({ code: 'invalid_regex' }));
  });

  test('explicit format disambiguates V3 entries with ST extension fields', async () => {
    const result = await runBook(v3Book([entry('regex', {
      keys: ['k.y'], use_regex: true, extensions: { position: 4, depth: 0, role: 2 }
    })], { extensions: { world_card_station: { format: 'v3' } } }));
    expect(selected(result)).toEqual(['regex']);
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'regex' });
  });

  test('does not count temporary injections as history or scan them', async () => {
    const result = await runBook(book([entry('old', { keys: ['old'] }), entry('key')], { scan_depth: 1 }), {
      messages: [user('old'), assistant('no match'),
        { role: 'user', content: 'key', _meta: { visibility: 'llm_only', source: 'helper' } }]
    });
    expect(selected(result)).toEqual([]);
  });

  test('uses all six optional matching sources and generation/character filters', async () => {
    const fields = ['match_persona_description', 'match_character_description', 'match_character_personality',
      'match_character_depth_prompt', 'match_scenario', 'match_creator_notes'];
    const entries = fields.map((field, index) => entry(`source-${index}`, { extensions: { [field]: true } }));
    entries.push(entry('filter', { constant: true, triggers: ['continue'], characterFilter: { tags: ['school'] } }));
    const args = {
      generation_type: 'continue', user: { description: 'key' },
      character: { name: 'Haru', tags: ['school'], description: 'key', personality: 'key', depth_prompt: 'key', scenario: 'key', creator_notes: 'key' }
    };
    const result = await runBook(stBook(entries, { scan_depth: 0 }), { messages: [], args });
    expect(selected(result)).toHaveLength(7);
    expect(selected(await runBook(stBook(entries), { messages: [] }))).toEqual([]);
  });

  test('only injects body, never entry names or comments; disabled entries do not read files', async () => {
    const result = await runBook(book([entry('id', { name: 'private name', comment: 'private comment', content: 'body' }),
      entry('disabled', { enabled: false, extensions: { world_card_station: { content_file: 'entries/missing.md' } } })]));
    expect(injected(result)[0].content).toBe('body');
    expect(result.readText).toHaveBeenCalledTimes(1);
  });

  test('requires both ST name and tag filters and trims ST keyword whitespace', async () => {
    const config = stBook([entry('filter', {
      keys: [' key '], characterFilter: { names: ['character-file'], tags: ['school'] }
    })]);
    expect(selected(await runBook(config, { args: { character: { id: 'character-file', name: 'Name', tags: ['school'] } } })))
      .toEqual(['filter']);
    expect(selected(await runBook(config, { args: { character: { id: 'other', tags: ['school'] } } }))).toEqual([]);
  });
});
