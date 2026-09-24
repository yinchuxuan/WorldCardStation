import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';
import { barrier } from './agentRuntimeHelpers.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
test('failed patch retains prior commits and prose, pauses pending input, and retry alone restores the baseline', async () => {
  const firstPage = barrier(), failNow = barrier();
  let fail = true, calls = 0;
  const session = testMainSession(factory, `export async function onInput(ctx) {
    const call = ctx.agents.call('narrator');
    await ctx.present(ctx.createReader({ source: call.response, mode: 'segmented' }));
    await call.done();
  }`, async (_, cb) => {
    calls += 1;
    cb.onToken('<state_patch_stream>{"count":2}</state_patch_stream>kept page\n\n');
    if (fail) {
      await failNow.promise;
      cb.onToken('<state_patch_stream>{"count":9,"visual.bgm":"wrong"}</state_patch_stream>tail');
    }
  });
  const stop = session.subscribe((view, detail) => {
    if (detail.type === 'display') firstPage.resolve();
  });
  try {
    await session.start();
    const baseline = session.snapshot(), work = session.send('one');
    await firstPage.promise;
    const pending = session.send('two');
    failNow.resolve();
    session.advance();
    await expect(work).rejects.toThrow('LLM cannot write state.visual.bgm');
    expect(session.running).toBe(false);
    expect(session.queuePaused).toBe(true);
    expect(session.pendingCount).toBe(1);
    expect(session.view().state.count).toBe(2);
    expect(session.view().records[0].content).toBe('kept page');
    expect(session.view().pendingInput).toBeNull();
    expect(session.advance()).toBe(false);
    expect(session.snapshot()).toEqual(baseline);
    expect(() => session.exportSession()).toThrow('不能保存');
    await expect(session.send('three')).rejects.toThrow('请重试');
    expect(calls).toBe(1);
    fail = false;
    const starts = [];
    const resume = session.subscribe((view, detail) => {
      if (detail.type === 'start') starts.push(view.state.count);
      if (view.reading) session.advance();
    });
    try { await session.retry('edited'); } finally { resume(); }
    await expect(pending).rejects.toMatchObject({ code: 'INPUT_DISCARDED' });
    expect(starts).toEqual([0]);
    expect(session.failed).toBe(false);
    expect(session.snapshot().messages.filter(m => m.role === 'user').map(m => m.content)).toEqual(['edited']);
    expect(() => session.exportSession()).not.toThrow();
  } finally { stop(); failNow.resolve(); await session.dispose(); }
});

test('a completed assistant message remains visible in Agent history when post_response fails', async () => {
  const session = testMainSession(factory, `export async function onInput(ctx) {
    await ctx.agents.call('narrator').done();
  }`, async (_, cb) => cb.onToken('completed response'), { definition: { agents: {
    narrator: { definition: { model: 'default', rules: [
      { when: { phase: 'post_response' }, then: [{ type: 'state.set', path: 'count', value: 'invalid' }] }
    ] } }
  } } });
  try {
    await expect(session.send('go')).rejects.toThrow();
    expect(session.view().contexts.narrator.messages.at(-1).content).toBe('completed response');
    expect(session.failed).toBe(true);
  } finally { await session.dispose(); }
});
