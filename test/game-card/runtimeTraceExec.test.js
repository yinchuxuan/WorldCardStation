import { applyGameCardAsync } from '../../src/renderer/gameCard/engine.js';
import { createTraceRecorder } from '../../src/shared/game-card/trace/changes.js';
import { resolveExecSource } from '../../src/renderer/gameCard/execSource.js';
import { runExecAction } from '../../src/renderer/gameCard/execRunner.js';
import { prepareStatePatchAtCursor } from '../game-card/legacyPatchHarness.js';

function setup() {
  const events = [], messages = [{ role: 'user', content: 'before' }], state = { hp: 1 };
  return { events, messages, state, observer: createTraceRecorder(event => events.push(event), { messages, state }) };
}

test('included exec source maps actual generated lines without changing the compiled source', () => {
  const fileContents = {
    'main.js': '// main header\ninclude("./helper.js");\nfunction run(ctx) {\n return help(ctx);\n}',
    'helper.js': '// helper\nfunction help(ctx) {\n return { state: ctx.state };\n}'
  };
  const traced = setup();
  const action = { sourceFile: 'main.js' };
  const source = resolveExecSource(action, { fileContents, observer: traced.observer });
  expect(source).toBe(resolveExecSource(action, { fileContents }));
  const map = traced.events.find(event => event.type === 'exec.source').lines;
  const generated = source.split('\n');
  expect(map).toHaveLength(generated.length);
  for (const [index, line] of generated.entries()) {
    if (!line.trim()) continue;
    expect(fileContents[map[index].file].split('\n')[map[index].line - 1]).toBe(line);
  }
});

test('exec records real reads, input arguments, effects and complete message-array replacement', async () => {
  const { events, ...snapshot } = setup();
  const card = { id: 'exec-trace', name: 'Trace', version: '1', files: { world: { directory: 'book', include: ['*.md'] } }, rules: [{
    when: { phase: 'pre_send' }, then: [{ type: 'exec', sourceFile: 'main.js', args: { count: 2 } }]
  }] };
  const result = await applyGameCardAsync({ ...snapshot, card, phase: 'pre_send', fileContents: {
    'main.js': 'async function run(ctx) { const text = await ctx.files.readText("world", "entry.md"); return { messages: [{role:"system",content:text}], state: { count: ctx.args.count }, effects: { selected: [1] } }; }'
  }, dependencies: { readText: async path => { expect(path).toBe('book/entry.md'); return 'entry text'; } } });
  expect(result.trace.errors).toEqual([]);
  expect(events.find(event => event.type === 'exec.input').args).toEqual({ count: 2 });
  expect(events.find(event => event.type === 'resource.read' && event.scopeId === 'world'))
    .toMatchObject({ file: 'book/entry.md', status: 'completed' });
  expect(events.find(event => event.type === 'exec.end')).toMatchObject({
    changes: { messages: { operation: 'replace', before: snapshot.messages, after: [{ role: 'system', content: 'entry text' }] } },
    result: { effects: { selected: [1] } }
  });
});

test('timeout leaves the exec start, prior state changes and explicit rule rollback in the log', async () => {
  const { events, ...snapshot } = setup();
  const card = { id: 'timeout', name: 'Timeout', version: '1', rules: [{ when: { phase: 'pre_send' }, then: [
    { type: 'state.set', path: 'hp', value: 10 }, { type: 'exec', source: 'while (true) {}' }
  ] }] };
  const result = await applyGameCardAsync({ ...snapshot, card, phase: 'pre_send', dependencies: {
    runExecAction: (messages, state, action, options) => runExecAction(messages, state, action, { ...options, timeoutMs: 20 })
  } });
  expect(result.state).toEqual(snapshot.state);
  expect(events.find(event => event.type === 'exec.error').error.code).toBe('SCRIPT_TIMEOUT');
  expect(events.find(event => event.type === 'rule.rollback').changes.state)
    .toEqual([{ path: '/hp', before: 10, after: 1 }]);
});

test('state patches record attempted values, clamp outcomes and each actual state change', async () => {
  const { events, ...snapshot } = setup();
  const card = { id: 'patch', name: 'Patch', version: '1', rules: [], state: { schema: { hp: { type: 'number', min: 0, max: 5, default: 1, onInvalid: 'clamp' } } } };
  const result = await prepareStatePatchAtCursor({ ...snapshot, card, patchText: '{"hp":100}' });
  expect(result.state.hp).toBe(5);
  expect(events.find(event => event.type === 'state.write').attempted).toBe(100);
  expect(events.find(event => event.type === 'state.validation').result).toMatchObject({ value: 5, changed: true });
  expect(events.find(event => event.type === 'patch.action.end').changes.state)
    .toEqual([{ path: '/hp', before: 1, after: 5 }]);
});
