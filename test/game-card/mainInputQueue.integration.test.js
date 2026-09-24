import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';
import { barrier } from './agentRuntimeHelpers.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
function waitFor(session, predicate) {
  if (predicate(session.view())) return Promise.resolve();
  return new Promise(resolve => {
    const stop = session.subscribe(view => { if (predicate(view)) { stop(); resolve(); } });
  });
}

test('interactive page finishes present but subsequent main work still precedes queued input', async () => {
  const gate = barrier(), entered = barrier(), calls = [];
  const session = testMainSession(factory, `export async function onInput(ctx, input) {
    await ctx.present(ctx.createReader({ source: 'body\\n\\nINTERACTIVE', mode: 'segmented' }),
      { waitForAdvance: text => text !== 'INTERACTIVE' });
    await ctx.agents.call('judge').done();
    ctx.state.set('count', ctx.state.get('count') + 1);
  }`, async () => { calls.push('judge'); entered.resolve(); await gate.promise; });
  try {
    const first = session.send('one');
    await waitFor(session, view => view.reading);
    expect(session.view().records[0].content).toBe('body');
    session.advance();
    await entered.promise;
    expect(session.view().records[0].content).toBe('body\n\nINTERACTIVE');
    expect(session.advance()).toBe(false);
    expect(session.running).toBe(true);
    const second = session.send('two');
    expect(session.pendingCount).toBe(1);
    expect(calls).toHaveLength(1);
    gate.resolve();
    await first;
    await waitFor(session, view => view.reading && view.records.length === 2);
    expect(session.view().state.count).toBe(1);
    session.advance();
    const result = await second;
    expect(result.state.count).toBe(2);
    expect(result.messages.filter(msg => msg.role === 'user').map(msg => msg.content)).toEqual(['one', 'two']);
    expect(result.records.at(-1).content).toBe('body\n\nINTERACTIVE');
    expect(session.running).toBe(false);
    expect(() => session.exportSession()).not.toThrow();
  } finally { await session.dispose(); }
});

test('no-wait display still waits for source EOF rather than returning on an interactive marker', async () => {
  const gate = barrier();
  const session = testMainSession(factory, `export async function onInput(ctx) {
    const call = ctx.agents.call('narrator');
    await ctx.present(ctx.createReader({ source: call.response, mode: 'segmented' }), { waitForAdvance: false });
    await call.done(); ctx.state.set('count', 1);
  }`, async (_, cb) => { cb.onToken('INTERACTIVE\n\n'); await gate.promise; cb.onToken('tail'); });
  try {
    const work = session.send('go');
    await waitFor(session, view => view.records.length);
    expect(session.advance()).toBe(false);
    expect(session.view().state.count).toBe(0);
    expect(session.running).toBe(true);
    gate.resolve();
    expect((await work).records[0].content).toBe('INTERACTIVE\n\ntail');
    expect(session.snapshot().state.count).toBe(1);
  } finally { await session.dispose(); }
});

test.each(['retry', 'beginLoad', 'dispose'])('%s cancels the active round and clears queued input', async action => {
  const entered = barrier(), gate = barrier();
  let request, count = 0;
  const session = testMainSession(factory, `export async function onInput(ctx) {
    await ctx.agents.call('judge').done(); ctx.state.set('count', ctx.state.get('count') + 1);
  }`, async req => { if (++count === 1) { request = req; entered.resolve(); await gate.promise; } });
  try {
    const first = session.send('one'); await entered.promise;
    const pending = session.send('two');
    await session[action]();
    await expect(first).rejects.toThrow('cancelled');
    await expect(pending).rejects.toMatchObject({ code: 'INPUT_DISCARDED' });
    expect(request.signal.aborted).toBe(true);
    gate.resolve();
    expect(session.pendingCount).toBe(0);
    expect(session.snapshot().state.count).toBe(action === 'retry' ? 1 : 0);
    expect(count).toBe(action === 'retry' ? 2 : 1);
  } finally { gate.resolve(); await session.dispose(); }
});

test.each(['async () => false', '() => "false"'])('invalid present decision rolls back even if caught: %s', async callback => {
  const session = testMainSession(factory, `export async function onInput(ctx) {
    try { await ctx.present(ctx.createReader({source:'page',mode:'segmented'}), {waitForAdvance:${callback}}); } catch {}
  }`);
  try {
    await expect(session.send('go')).rejects.toThrow('boolean');
    expect(session.snapshot().records).toEqual([]);
  } finally { await session.dispose(); }
});
