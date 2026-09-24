import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';
import { barrier } from './agentRuntimeHelpers.js';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadRuntimeDefinition } from '../../src/shared/game-card/runtime/loadDefinition.js';
import { createMainSession } from '../../src/renderer/gameCard/mainSession.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
const source = `
import { increment } from './lib/logic.js';
export async function onInput(ctx, input) {
  ctx.state.set('input', input);
  await ctx.agents.call('judge').done();
  ctx.state.set('count', increment(ctx.state.get('count')));
  if (ctx.state.get('verdict') === 'yes') await ctx.agents.call('narrator').done();
}`;
const files = { 'lib/logic.js': 'export const increment = value => value + 1;' };

test('real Worker runs Judge → JS → Narrator; subsequent rounds keep all contexts', async () => {
  const seen = [];
  const session = testMainSession(factory, source, async (request, cb) => {
    seen.push(request);
    cb.onToken(request.agentId === 'judge' ? '<state_patch>{"verdict":"yes"}</state_patch>' : 'hidden');
  }, { files });
  const first = await session.send('hello');
  expect(first.state).toMatchObject({ input: 'hello', count: 1, verdict: 'yes' });
  expect(seen.map(item => item.agentId)).toEqual(['judge', 'narrator']);
  expect(seen[0].messages).toEqual([]);
  expect(first.contexts.narrator.messages[0].content).toBe('hidden');
  await session.send('again');
  expect(session.snapshot().state.count).toBe(2);
  expect(seen[2].messages).toHaveLength(1);
  expect(session.snapshot().contexts.judge.initialized).toBe(true);
  expect(session.snapshot().contexts.judge.messages.map(m => m.id)).toEqual(['msg-round-2-1', 'msg-round-3-1']);
  await session.dispose();
});

test('shared on-disk fixture loads real files, runs main and invokes exact model references', async () => {
  const root = path.resolve('test/fixtures/runtime-definition');
  const readText = file => readFile(path.join(root, file), 'utf8');
  const definition = await loadRuntimeDefinition({ readText, modelIds: ['narration-model'],
    stat: async file => (await stat(path.join(root, file))).isFile() ? 'file' : 'directory' });
  const seen = [];
  const session = createMainSession({ definition, readText, workerFactory: factory,
    generate: async (request, cb) => { seen.push(request); cb.onToken(request.agentId === 'judge' ? ' approved ' : 'narration'); }
  });
  const result = await session.send('inspect');
  expect(seen.map(request => request.model)).toEqual(['default', 'narration-model']);
  expect(seen[0].messages.at(-1).content).toBe('inspect');
  expect(result.state.turn).toEqual({ input: 'inspect', judgment: { text: 'approved', accepted: true }, narrated: true });
});

test('JS branch can skip narrator and still finish a complete round', async () => {
  const seen = [];
  const session = testMainSession(factory, source, async ({ agentId }, cb) => {
    seen.push(agentId); cb.onToken('<state_patch>{"verdict":"no"}</state_patch>');
  }, { files });
  const result = await session.send('go');
  expect(seen).toEqual(['judge']);
  expect(result.state.count).toBe(1);
  expect(result.contexts.narrator.initialized).toBe(true);
});

test('second Agent failure retains the live scene; retry restores baseline and re-executes both', async () => {
  let fail = true;
  const ids = [];
  const session = testMainSession(factory, source, async ({ agentId }, cb) => {
    ids.push(agentId);
    if (agentId === 'narrator' && fail) throw new Error('provider failed');
    cb.onToken(agentId === 'judge' ? '<state_patch>{"verdict":"yes"}</state_patch>' : 'ok');
  }, { files });
  await session.start();
  const baseline = session.snapshot();
  await expect(session.send('hello')).rejects.toThrow('provider failed');
  expect(session.snapshot()).toEqual(baseline);
  expect(session.view().state.verdict).toBe('yes');
  expect(session.view().contexts.judge.messages).toHaveLength(1);
  expect(session.failed).toBe(true);
  expect(session.running).toBe(false);
  expect(() => session.exportSession()).toThrow('不能保存');
  fail = false;
  await session.retry();
  expect(ids).toEqual(['judge', 'narrator', 'judge', 'narrator']);
  expect(session.snapshot().state.count).toBe(1);
  await session.retry('edited');
  expect(session.snapshot().state).toMatchObject({ count: 1, input: 'edited' });
  expect(session.snapshot().contexts.judge.messages).toHaveLength(1);
});

test('cancel discards pending input, aborts transport, and fences late callbacks', async () => {
  const started = barrier(), gate = barrier();
  let request, callbacks;
  const session = testMainSession(factory, source, async (req, cb) => {
    request = req; callbacks = cb; started.resolve(); await gate.promise;
  }, { files });
  const result = session.send('first');
  await started.promise;
  const pending = session.send('second');
  expect(session.pendingCount).toBe(1);
  await session.cancel();
  await expect(result).rejects.toThrow('cancelled');
  await expect(pending).rejects.toMatchObject({ code: 'INPUT_DISCARDED' });
  expect(request.signal.aborted).toBe(true);
  const baseline = session.snapshot();
  callbacks.onToken('<state_patch>{"count":999}</state_patch>');
  gate.resolve();
  await Promise.resolve();
  expect(session.snapshot()).toEqual(baseline);
  await session.dispose();
  await expect(session.send('old')).rejects.toThrow('disposed');
});

test('real Worker terminates runaway synchronous and microtask computation', async () => {
  for (const body of ['while(true) {}', 'while(true) { await Promise.resolve(); }']) {
    const session = testMainSession(factory, `export async function onInput(ctx) { ctx.state.set('count', 1); ${body} }`);
    await expect(session.send('go')).rejects.toThrow('timed out');
    expect(session.snapshot().state.count).toBe(0);
  }
});

test('unfinished and swallowed failed Agent calls cannot commit a round', async () => {
  for (const body of ["ctx.agents.call('judge');", "try { await ctx.agents.call('judge').done(); } catch {}"] ) {
    const session = testMainSession(factory, `export async function onInput(ctx) { ${body} }`, async () => { throw new Error('no model'); });
    await expect(session.send('go')).rejects.toThrow();
    expect(session.snapshot().contexts.judge.initialized).toBe(true);
  }
});

test('unresolved script Promise has no right to keep a round alive', async () => {
  const session = testMainSession(factory, 'export async function onInput() { await new Promise(() => {}); }');
  await expect(session.send('go')).rejects.toThrow('unresolved task');
});

test('model wait survives multiple CPU deadlines while Worker remains responsive', async () => {
  const gate = barrier();
  let replies = 0;
  const observingFactory = () => {
    const adapter = factory();
    let listener;
    Object.defineProperty(adapter, 'onmessage', {
      set: value => { listener = value; },
      get: () => event => {
        if (event.data.type === 'pong' && event.data.waiting && ++replies === 3) gate.resolve();
        listener?.(event);
      }
    });
    return adapter;
  };
  const session = testMainSession(observingFactory, 'export async function onInput(ctx) { await ctx.agents.call("judge").done(); }',
    async (_, cb) => { await gate.promise; cb.onToken('ok'); }, { timeoutMs: 50 });
  await session.send('go');
  expect(replies).toBeGreaterThanOrEqual(3);
});
