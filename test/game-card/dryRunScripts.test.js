import { checkCard } from '../../src/renderer/gameCard/dryRun/checkCard.js';
import { compileExecSource } from '../../src/shared/game-card/exec/execCompilation.js';
import { scriptWorkerSource } from '../../src/renderer/platform/scriptWorkerSource.js';

const base = { id: 'dry-run', name: 'Check', version: '1', rules: [] };
const exec = action => ({ ...base, rules: [{ when: { phase: 'init' }, then: [{ type: 'exec', ...action }] }] });
const reader = files => jest.fn(async file => {
  if (!(file in files)) throw new Error(`missing: ${file}`);
  return files[file];
});

test('compiles but never runs top-level code, run(ctx), inline exec or UI initialization', async () => {
  const readText = reader({
    'main.js': 'throw new Error("TOP LEVEL RAN"); while (true) {}\nfunction run(ctx) { throw new Error("RUN"); }',
    'ui.js': 'throw new Error("UI RAN"); function Root() { throw new Error("RENDER"); }'
  });
  const source = 'throw new Error("INLINE RAN"); state.changed = true; return { state };';
  const card = exec({ sourceFile: 'main.js' });
  card.rules[0].then.push({ type: 'exec', source });
  card.ui = { root: { source: 'ui.js' } };
  const before = JSON.stringify(card);
  expect((await checkCard(card, readText)).diagnostics).toEqual([]);
  expect(JSON.stringify(card)).toBe(before);
});

test.each([
  ['return (', 'exec_syntax'],
  ['await Promise.resolve();', 'exec_syntax'],
  ['const args = {};', 'exec_syntax'],
  ['return eval("1");', 'exec_syntax']
])('validates inline syntax using the production wrapper: %s', async (source, code) => {
  const result = await checkCard(exec({ source }), reader({}));
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code, pointer: '/rules/0/then/0/source' }));
});

test('resolves relative and root includes, caches reads and locates original helper syntax errors', async () => {
  const readText = reader({
    'lib/main.js': 'include("./helper.js");\nfunction run() { return {}; }',
    'lib/helper.js': 'const broken = ;'
  });
  const result = await checkCard(exec({ sourceFile: './lib/main.js' }), readText);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'exec_syntax', file: 'lib/helper.js' }));
  expect(readText).toHaveBeenCalledTimes(2);
});

test.each([
  ['include("./main.js");', 'circular'],
  ['include("../../outside.js");', 'inside'],
  ['include("./missing.js");', 'missing']
])('rejects broken include graphs: %s', async (source, message) => {
  const result = await checkCard(exec({ sourceFile: 'lib/main.js' }), reader({ 'lib/main.js': source }));
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'exec_include', message: expect.stringContaining(message) }));
});

test('also compiles concatenated sources to detect declaration conflicts across includes', async () => {
  const result = await checkCard(exec({ sourceFile: 'main.js' }), reader({
    'main.js': 'include("helper.js");\nconst shared = 2; function run() {}',
    'helper.js': 'const shared = 1;'
  }));
  expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'exec_syntax', file: 'main.js' })]);
});

test('checks registered UI scripts and UI source syntax without executing either', async () => {
  const card = { ...base, ui: { scripts: { click: 'click.js' }, root: { source: 'root.js' } } };
  const result = await checkCard(card, reader({ 'click.js': 'function run( {', 'root.js': 'export function Root() { return <div/>; }' }));
  expect(result.diagnostics.map(item => item.code)).toEqual(['exec_syntax', 'ui_syntax']);
});

test('production worker uses the same compiler with no dependence on bundled identifier names', async () => {
  const postMessage = jest.fn();
  const self = { postMessage };
  Function('self', scriptWorkerSource)(self);
  await self.onmessage({ data: { source: 'return { state };', context: { state: { count: 1 } }, files: {} } });
  expect(postMessage).toHaveBeenCalledWith({ result: { state: { count: 1 } } });
  expect(() => compileExecSource('const args = 1;', false)).toThrow();
});
