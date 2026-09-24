import { loadMainModules, resolveModule } from '../../src/shared/game-card/runtime/mainModules.js';
import { loadMainProgram } from '../../src/renderer/gameCard/mainProgram.js';

const load = (source, files = {}) => loadMainModules({ main: { path: 'main.js', source },
  readText: async path => { if (files[path] === undefined) throw new Error('missing file'); return files[path]; } });

test('module graph resolves static named/namespace imports once in dependency order', async () => {
  const graph = await load(`import {add as inc} from './lib/a.js'; import * as a from './lib/a.js';
    export async function onInput(ctx) { ctx.state.set('count', inc(a.one)); }`, {
    'lib/a.js': 'export const one = 1; export function add(x) { return x + one; }'
  });
  expect(graph.modules.map(m => m.path)).toEqual(['lib/a.js', 'main.js']);
  const modules = {};
  for (const module of graph.modules) modules[module.path] = Function('__wcsImports', module.source)(modules);
  const set = jest.fn();
  await modules['main.js'].onInput({ state: { set } });
  expect(set).toHaveBeenCalledWith('count', 2);
  expect(resolveModule('lib/a.js', '../b.js')).toBe('b.js');
});

test.each(['https://example.com/x.js', '/a.js', '../../a.js', './a\\b.js', './a.js?raw', './%2e%2e/a.js', './a.json', './a//b.js'])(
  'rejects unsafe import %s before reading it', async path => {
  await expect(load(`import ${JSON.stringify(path)}; export async function onInput() {}`)).rejects.toThrow('main.js');
});

test.each([
  'export async function other() {}',
  'export default function onInput() {}',
  'export let onInput = () => {}',
  'export const {onInput} = {}',
  'export {onInput} from "./a.js"',
  'export async function onInput() { await import("./a.js"); }',
  'export async function onInput() { return import.meta.url; }',
  'export async function onInput() { return eval("1"); }',
  'export async function onInput(__wcsImports) {}',
  'export function onInput( {'
])('rejects unsupported module contract: %s', async source => {
  await expect(load(source)).rejects.toThrow();
});

test('missing imports, missing exports, and cycles include source context', async () => {
  await expect(load('import "./missing.js"; export async function onInput() {}')).rejects.toThrow('missing.js');
  await expect(load('import {no} from "./a.js"; export async function onInput() {}', { 'a.js': 'export const yes = 1;' })).rejects.toThrow('missing export no');
  await expect(load('import "./a.js"; export async function onInput() {}', { 'a.js': 'import "./main.js";' })).rejects.toThrow('circular');
});

test('preloads Agent content and nested exec includes without reading arbitrary directories', async () => {
  const files = { 'intro.md': "include('not-a-script');", 'rules.js': "include('./helper.js'); function run() {}", 'helper.js': 'const x = 1;' };
  const definition = { main: { path: 'main.js', source: 'export async function onInput() {}' },
    card: { files: { intro: 'intro.md' } }, agents: { judge: { definition: { rules: [
      { when: { phase: 'pre_send' }, then: [{ type: 'exec', sourceFile: 'rules.js' }] }
    ] } } } };
  const read = jest.fn(async path => files[path]);
  expect((await loadMainProgram(definition, read)).fileContents).toEqual(files);
  expect(read).toHaveBeenCalledTimes(3);
  files['helper.js'] = "include('./rules.js');";
  await expect(loadMainProgram(definition, read)).rejects.toThrow('circular');
});
