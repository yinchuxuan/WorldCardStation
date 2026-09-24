import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });

test('main code cannot access host, network, storage, timers, dynamic constructors or credentials', async () => {
  const session = testMainSession(factory, `export async function onInput(ctx) {
    ctx.state.set('globals', [typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof Worker,
      typeof globalThis, typeof self, typeof window, typeof document, typeof navigator, typeof indexedDB,
      typeof caches, typeof process, typeof require, typeof postMessage, typeof setTimeout, typeof WebAssembly]);
    ctx.state.set('constructors', [typeof (() => {}).constructor, typeof (async () => {}).constructor,
      typeof (function* () {}).constructor, typeof (async function* () {}).constructor]);
    ctx.state.set('keys', Object.keys(ctx));
    const snapshot = ctx.agents.messages('judge');
    try { snapshot.push({role:'user',content:'forged'}); } catch {}
    await ctx.agents.call('judge').done();
  }`, async (_, cb) => cb.onToken('ok'));
  const result = await session.send('go');
  expect(result.state.globals).toEqual(Array(16).fill('undefined'));
  expect(result.state.constructors).toEqual(Array(4).fill('undefined'));
  expect(result.state.keys).toEqual(['state', 'createReader', 'present', 'agents']);
  expect(result.contexts.judge.messages).toHaveLength(1);
});

test.each([
  "await import('https://example.com/code.js')",
  "const compiler = eval; compiler('1')",
  "const compiler = \\u0046unction; compiler('return this')()",
  'Object.prototype.polluted = true',
  'Array.prototype.push = () => 0',
  "({}).constructor.constructor('return this')()"
])('blocked script operation: %s', async body => {
  const session = testMainSession(factory, `export async function onInput() { ${body}; }`);
  await expect(session.send('go')).rejects.toThrow();
});

test('rule exec runs in the same restricted realm with existing State/result semantics', async () => {
  const session = testMainSession(factory, `export async function onInput(ctx) {
    await ctx.agents.call('judge').done();
    ctx.state.set('count', ctx.state.get('count') + 1);
  }`, async (_, cb) => cb.onToken('ok'), { definition: { agents: { judge: { definition: {
    model: 'default', rules: [{ when: { phase: 'post_response' }, then: [{ type: 'exec', source:
      "state.count = 4; state.host = typeof fetch; return {state};" }] }]
  } } } } });
  const result = await session.send('go');
  expect(result.state).toMatchObject({ count: 5, host: 'undefined' });
});

test('module top-level runtime errors and invalid onInput are attributed to source files', async () => {
  for (const source of ['export const onInput = 2;', 'throw new Error("broken"); export async function onInput() {}']) {
    const session = testMainSession(factory, source);
    await expect(session.send('go')).rejects.toThrow('main.js');
  }
});
