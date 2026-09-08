const { user, assistant, entry, v3Book, stBook, runBook, selected, injected } = require('./worldbookTestRuntime');

describe('V3 worldbook decorators and safe text macros', () => {
  test('parses Markdown decorators before matching, including forced activation and disabled entries', async () => {
    const result = await runBook(v3Book([
      entry('forced', { keys: [], extensions: { world_card_station: { content_file: 'entries/forced.md' } } }),
      entry('disabled', { enabled: false, content: '@@activate\ndisabled' }),
      entry('off', { constant: true, content: '@@dont_activate\noff' })
    ]), { messages: [], files: { 'worldbook/entries/forced.md': '@@dont_activate\n@@activate\n\nbody' } });
    expect(selected(result)).toEqual(['forced']);
    expect(injected(result)[0].content).toBe('body');
  });

  test('supports at least five chained fallbacks, strips unknown directives, and honors the first value', async () => {
    const result = await runBook(v3Book([entry('fallback', {
      constant: true, content: '@@unknown\n@@@instruct_depth 3\n@@@role invalid\n@@@depth nope\n@@@other\n@@@depth 0\n@@depth 5\n@@role assistant\n@@role user\n\nbody'
    })]));
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'body' });
    expect(result.report.warnings.some(warning => warning.code === 'ignored_decorator')).toBe(true);
  });

  test('activation count uses assistant messages and decorators constrain constants', async () => {
    const config = v3Book([entry('after', { constant: true, content: '@@activate_only_after 2\nafter' }),
      entry('every', { constant: true, content: '@@activate_only_every 2\nevery' })]);
    expect(selected(await runBook(config, { messages: [user('key'), assistant('one')] }))).toEqual([]);
    expect(selected(await runBook(config, { messages: [assistant('one'), user('key'), assistant('two')] }))).toEqual(['after', 'every']);
  });

  test('additional key lines are required filters; exclude keys veto the entry', async () => {
    const config = v3Book([entry('filters', { content: '@@additional_keys red,blue\n@@additional_keys wing\n@@exclude_keys banned\nbody' })]);
    expect(selected(await runBook(config, { messages: [user('key red')] }))).toEqual([]);
    expect(selected(await runBook(config, { messages: [user('key red wing')] }))).toEqual(['filters']);
    expect(selected(await runBook(config, { messages: [user('key blue wing banned')] }))).toEqual([]);
  });

  test('greeting, user icon and max-context conditions use optional runtime context', async () => {
    const config = v3Book([entry('context', {
      constant: true, content: '@@is_greeting 1\n@@is_user_icon portrait\n@@ignore_on_max_context\nbody'
    })]);
    const args = { greeting_index: 1, user: { icon: 'portrait' }, max_context_reached: false };
    expect(selected(await runBook(config, { args }))).toEqual(['context']);
    expect(selected(await runBook(config, { args: { ...args, greeting_index: 0 } }))).toEqual([]);
    expect(selected(await runBook(config, { args: { ...args, max_context_reached: true } }))).toEqual([]);
  });

  test('position overrides depth; missing optional sections activate their fallback', async () => {
    const result = await runBook(v3Book([entry('position', {
      constant: true, content: '@@depth 0\n@@position after_desc\n@@@role user\nbody'
    })], { extensions: { world_card_station: { anchors: { description: 'desc' } } } }), {
      messages: [{ role: 'system', content: 'desc', _meta: { source: 'desc' } }, user('hi')]
    });
    expect(result.messages.map(message => message.content)).toEqual(['desc', 'body', 'hi']);
    const absent = await runBook(v3Book([entry('fallback', { constant: true, content: '@@position scenario\n@@@depth 0\nbody' })]));
    expect(absent.messages.at(-1).content).toBe('body');
  });

  test('scan_depth decorator overrides the book scan depth', async () => {
    const result = await runBook(v3Book([entry('recent', { content: '@@scan_depth 1\nbody' })], { scan_depth: 5 }), {
      messages: [user('key'), assistant('no match')]
    });
    expect(selected(result)).toEqual([]);
  });

  test('expands standard macros, strips comments and uses hidden keys only for recursion', async () => {
    const result = await runBook(v3Book([
      entry('macros', { constant: true,
        content: '{{CHAR}}/{{user}} {{random:A,B\\,C}} {{roll:d6}} {{reverse:abc}} {{// private}} {{comment: ignore}} {{hidden_key:secret}}' }),
      entry('hidden', { keys: ['secret'] }), entry('comment', { keys: ['private', 'ignore'] })
    ], { recursive_scanning: true }), { args: { character: { name: 'Name', nickname: 'Nick' }, user: { name: 'Player' } }, random: () => 0.99 });
    expect(selected(result)).toEqual(['macros', 'hidden']);
    expect(injected(result)[0].content).toContain('Nick/Player B,C 6 cba');
    expect(injected(result)[0].content).not.toMatch(/secret|private|ignore|\{\{/);
  });

  test('pick is stable for the same prompt; ST double-colon choices are accepted', async () => {
    const config = stBook([entry('pick', { content: '{{pick:A,B,C}} {{random::X::Y}}' })]);
    const first = await runBook(config, { random: () => 0 });
    const retry = await runBook(config, { random: () => 0.99 });
    expect(injected(first)[0].content.split(' ')[0]).toBe(injected(retry)[0].content.split(' ')[0]);
    expect(injected(first)[0].content.endsWith(' X')).toBe(true);
    expect(injected(retry)[0].content.endsWith(' Y')).toBe(true);
  });

  test('does not execute unsupported plugin macros or automations and reports missing capabilities', async () => {
    const result = await runBook(stBook([entry('plugin', {
      content: '{{getvar::flag}}', extensions: { vectorized: true, automation_id: 'plugin-script' }
    })]));
    expect(injected(result)[0].content).toBe('{{getvar::flag}}');
    expect(result.report.warnings.map(warning => warning.code)).toEqual([
      'unsupported_vector_matching', 'unsupported_automation', 'unsupported_macro'
    ]);
  });

  test('ST activation decorators still honor probability and delay filters', async () => {
    const result = await runBook(stBook([
      entry('probability', { content: '@@activate\nbody', probability: 0, useProbability: true }),
      entry('delay', { content: '@@activate\nbody', delay: 5 })
    ]));
    expect(selected(result)).toEqual([]);
  });

  test('accepts the double-colon comma-separated pick spelling shown in the V3 specification', async () => {
    const result = await runBook(v3Book([entry('pick', { content: '{{pick::A,B,C}}' })]));
    expect(['A', 'B', 'C']).toContain(injected(result)[0].content);
  });
});
