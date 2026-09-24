import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
const init = then => ({ when: { phase: 'init' }, then });
const definition = { agents: {
  judge: { definition: { model: 'default', rules: [init([
    { type: 'state.inc', path: 'count', value: 1 },
    { type: 'insert', role: 'system', content: 'judge-ready' }
  ])] } },
  narrator: { definition: { model: 'default', rules: [init([
    { type: 'insert', role: 'assistant', content: 'opening:{{state:count}}', _meta: { source: 'opening' } }
  ])] } }
} };
const source = `export async function onStart(ctx) {
  if (ctx.agents.messages('judge')[0].content !== 'judge-ready') throw new Error('init order');
  const opening = ctx.agents.messages('narrator').find(msg => msg._meta?.source === 'opening');
  await ctx.present(ctx.createReader({source: opening.content, mode: 'continuous'}));
  ctx.state.set('count', ctx.state.get('count') + 1);
}
export async function onInput(ctx) { await ctx.agents.call('narrator').done(); }`;
function waiting(session) {
  if (session.view().reading) return Promise.resolve();
  return new Promise(resolve => {
    const stop = session.subscribe(view => { if (view.reading) { stop(); resolve(); } });
  });
}

test('all init rules precede onStart without a model; start and restore never replay completed opening', async () => {
  const generate = jest.fn(async (_, cb) => cb.onToken('reply'));
  const session = testMainSession(factory, source, generate, { definition });
  const restored = testMainSession(factory, source, generate, { definition });
  try {
    expect(() => session.exportSession()).toThrow('启动');
    await session.start();
    expect(generate).not.toHaveBeenCalled();
    expect(session.snapshot().records[0].content).toBe('opening:1');
    expect(session.snapshot().messages.map(msg => msg.role)).toEqual(['assistant']);
    expect(session.snapshot().state.count).toBe(2);
    expect(Object.values(session.snapshot().contexts).every(ctx => ctx.initialized)).toBe(true);
    const saved = session.exportSession();
    expect(saved.started).toBe(true);
    await session.start();
    expect(session.exportSession()).toEqual(saved);
    await restored.beginLoad(); restored.restoreHistory({ runtimeSession: saved });
    await restored.start();
    expect(restored.exportSession()).toEqual(saved);
    await restored.send('go');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(restored.snapshot().state.count).toBe(2);
    expect(restored.snapshot().contexts.judge.messages).toHaveLength(1);
    expect(restored.snapshot().records).toHaveLength(1);
  } finally { await session.dispose(); await restored.dispose(); }
});

test('segmented startup queues input and blocks saving; cancellation discards input and restarts init', async () => {
  const entry = source.replace("source: opening.content, mode: 'continuous'",
    `source: opening.content + '<state_patch_stream>{"count":8}</state_patch_stream>second', mode: 'segmented'`);
  const session = testMainSession(factory, entry, jest.fn(), { definition });
  const baseline = session.snapshot();
  try {
    const first = session.start(); await waiting(session);
    expect(() => session.exportSession()).toThrow('不能保存');
    const pending = session.send('early');
    expect(session.pendingCount).toBe(1);
    session.advance();
    await new Promise(resolve => {
      if (session.view().state.count === 8) return resolve();
      const stop = session.subscribe(view => { if (view.state.count === 8) { stop(); resolve(); } });
    });
    await session.cancel(); await expect(first).rejects.toThrow('cancelled');
    await expect(pending).rejects.toThrow('cancelled');
    expect(session.snapshot()).toEqual(baseline);
    expect(session.started).toBe(false);
    const stop = session.subscribe(view => { if (view.reading) session.advance(); });
    try { await session.retry(); } finally { stop(); }
    expect(session.snapshot().state.count).toBe(9);
    expect(session.snapshot().contexts.judge.messages).toHaveLength(1);
    expect(session.snapshot().records[0].content).toBe('opening:1\n\nsecond');
  } finally { await session.dispose(); }
});

test('init failure prevents onStart and rolls back preceding Agents; invalid onStart is rejected', async () => {
  for (const entry of [source, 'export const onStart = 1; export function onInput() {}']) {
    const session = testMainSession(factory, entry, jest.fn(), { definition: {
      agents: { ...definition.agents, narrator: { definition: { model: 'default', rules: [init([
        { type: 'state.set', path: 'count', value: 'invalid' }
      ])] } } }
    } });
    try {
      const baseline = session.snapshot();
      await expect(session.start()).rejects.toThrow();
      expect(session.snapshot()).toEqual(baseline);
      expect(session.started).toBe(false);
      expect(() => session.exportSession()).toThrow();
    } finally { await session.dispose(); }
  }
});
