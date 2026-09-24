import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRuntimeDefinition } from '../../src/shared/game-card/runtime/loadDefinition.js';
import { checkCard } from '../../src/renderer/gameCard/dryRun/checkCard.js';
import { createMainSession } from '../../src/renderer/gameCard/mainSession.js';
import { buildMainWorkerFactory } from './mainWorkerTestHost.js';
import { createTraceCapture } from '../../src/renderer/trace/traceCapture.js';
import { readExpandedJson } from '../../src/shared/game-card/runtime/jsonImports.js';

let root;
const readText = file => fs.readFile(path.join(root, file), 'utf8');
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcs-delivery-'));
  await fs.cp(path.resolve('test/fixtures/runtime-delivery'), root, { recursive: true });
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

test('production Worker uses imported Agent rules, records independent calls and restores actual output', async () => {
  const definition = await loadRuntimeDefinition({ readText });
  expect(definition.agents.narrator.sources['/rules/1/then/0/content']).toEqual({ file: 'rules/input.json', pointer: '/0/then/0/content' });
  const records = [];
  const capture = createTraceCapture({ append: async (_, items) => records.push(...items), close: async () => {} },
    { token: 'capture', path: 'test' }, { messages: [], state: {} }, error => { throw error; });
  const trace = { capture: () => capture, stop: () => capture.close('test') };
  const requests = [];
  const session = createMainSession({ definition, readText, trace, workerFactory: buildMainWorkerFactory(),
    generate: async (request, callbacks) => {
      requests.push(request);
      callbacks.onToken(request.agentId === 'judge' ? '<state_patch>{"verdict":"通过"}</state_patch>' : '实际展示');
    } });
  try {
    await session.send('行动');
    expect(requests[1].messages.some(msg => msg.content.includes('通过'))).toBe(true);
    expect(session.snapshot().records[0].content).toBe('实际展示');
    expect(session.snapshot().contexts.narrator.messages.at(-1).content).toBe('最终历史');
    session.setState({ ...session.snapshot().state, count: 1 });
    const saved = session.exportSession();
    await session.beginLoad(); session.restoreHistory({ runtimeSession: saved });
    expect(session.snapshot().state.count).toBe(1);
    await session.send('继续');
    expect(session.snapshot().contexts.judge.messages.filter(msg => msg.role === 'system')).toHaveLength(1);
    await trace.stop();
    expect(records.filter(event => event.type === 'agent.start')).toHaveLength(4);
    expect(new Set(records.filter(event => event.type === 'agent.start').map(event => event.callId)).size).toBe(4);
    expect(records.some(event => event.agentId === 'narrator' && event.source?.file === 'rules/input.json')).toBe(true);
    expect(JSON.stringify(records)).not.toMatch(/apiKey|Authorization/);
  } finally { await session.dispose(); await trace.stop(); }
});

test('dry-run checks imported declarations and main dependencies without executing code or models', async () => {
  const card = JSON.parse(await readText('card.json'));
  const initial = await checkCard(card, readText);
  expect(initial.diagnostics).toEqual([]);
  expect(initial.checked).toContain('main_modules');
  await fs.writeFile(path.join(root, 'scripts/narrate.js'), 'throw new Error("must not execute"); export function narrate() {}');
  expect((await checkCard(card, readText)).diagnostics).toEqual([]);
  await fs.writeFile(path.join(root, 'rules/input.json'), JSON.stringify([{ when: { phase: 'pre_send' }, then: [
    { type: 'insert', role: 'user', content: '{{file:missing}}' }
  ] }]));
  const invalid = await checkCard(card, readText);
  expect(invalid.diagnostics.some(item => item.file === 'rules/input.json' && item.pointer === '/0/then/0/content')).toBe(true);
  await fs.writeFile(path.join(root, 'scripts/narrate.js'), 'export function narrate( {}');
  expect((await checkCard(card, readText)).diagnostics.some(item => item.code === 'main_syntax')).toBe(true);
});

test('JSON import rejects cycles and keeps ordinary nested arrays intact', async () => {
  const expanded = await readExpandedJson(async () => '[[1,2],[3]]', 'array.json');
  expect(expanded.value).toEqual([[1, 2], [3]]);
  await fs.writeFile(path.join(root, 'rules/input.json'), '{"$import":"rules/input.json"}');
  await expect(loadRuntimeDefinition({ readText })).rejects.toThrow('circular');
});
