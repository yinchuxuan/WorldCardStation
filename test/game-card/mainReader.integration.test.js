import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';
import { barrier } from './agentRuntimeHelpers.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
const patch = '<state_patch_stream>{"count":2}</state_patch_stream>';
const source = `export async function onInput(ctx) {
  await ctx.agents.call('judge').done();
  const call = ctx.agents.call('narrator');
  await ctx.present(ctx.createReader({source: call.response, mode: 'segmented'}));
  await call.done();
}`;
function waitFor(session, predicate) {
  if (predicate(session.view())) return Promise.resolve(session.view());
  return new Promise(resolve => {
    const stop = session.subscribe(view => { if (predicate(view)) { stop(); resolve(view); } });
  });
}
test('validation warnings cross the Worker bridge before present finishes, independently of post_response deletion', async () => {
  const warned = barrier(), events = [];
  const session = testMainSession(factory, `export async function onInput(ctx) {
    const call = ctx.agents.call('narrator');
    await ctx.present(ctx.createReader({source:call.response,mode:'segmented'}));
    await call.done();
  }`, async (_, cb) => cb.onToken('body'), { definition: { agents: {
    narrator: { definition: { model: 'default', responseValidation: { onFailure: 'warn', rules: [
      { id: 'choices', type: 'content.regex', pattern: '<choices>', matches: { eq: 1 }, message: '缺少选项' }
    ] }, rules: [{ when: { phase: 'post_response' }, then: [{ type: 'remove', predicate: { role: 'assistant' } }] }] } }
  } } });
  const stop = session.subscribe((_, detail) => {
    if (detail.type === 'agent-response') { events.push(detail); warned.resolve(); }
  });
  try {
    const work = session.send('go');
    await warned.promise;
    await waitFor(session, view => view.reading);
    expect(session.running).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ agentId: 'narrator', warnings: [{ id: 'choices', message: '缺少选项' }] });
    session.advance();
    expect((await work).contexts.narrator.messages).toEqual([]);
    expect(events).toHaveLength(1);
  } finally { stop(); await session.dispose(); }
});
test('hidden Agent, buffered real response, reading State and actual records use separate completion boundaries', async () => {
  const session = testMainSession(factory, source, async ({ agentId }, cb) => {
    cb.onToken(agentId === 'judge' ? 'hidden' : `first${patch}second${patch}`);
  });
  await session.start();
  const baseline = session.snapshot();
  const work = session.send('go');
  await waitFor(session, view => view.reading && view.contexts.narrator.messages.length);
  expect(session.running).toBe(true);
  expect(session.snapshot()).toEqual(baseline);
  expect(session.view().state.count).toBe(0);
  expect(session.view().records.map(record => record.content)).toEqual(['first']);
  session.advance();
  await waitFor(session, view => view.reading && view.records[0]?.content.includes('second'));
  expect(session.view().state.count).toBe(2);
  session.advance();
  const result = await work;
  expect(result.records[0].units).toEqual([
    { text: 'first', patches: [] }, { text: 'second', patches: ['{"count":2}'] }, { text: '', patches: ['{"count":2}'] }
  ]);
  expect(result.contexts.judge.messages[0].content).toBe('hidden');
  expect(result.contexts.narrator.messages[0].content).toContain('state_patch_stream');
  expect(session.advance()).toBe(false);
});
test.each(['raw', 'static'])('post_response rewriting affects only static source: %s', async kind => {
  const main = `export async function onInput(ctx) {
    const call = ctx.agents.call('narrator');
    ${kind === 'static' ? 'await call.done();' : ''}
    const source = ${kind === 'static' ? "ctx.agents.messages('narrator').find(m => m.id === call.messageId).content" : 'call.response'};
    await ctx.present(ctx.createReader({source, mode: 'continuous'})); await call.done();
  }`;
  const session = testMainSession(factory, main, async (_, cb) => {
    cb.onToken('raw<state_patch>[{"type":"state.inc","path":"count","value":1}]</state_patch>');
  }, { definition: { agents: { narrator: { definition: { model: 'default', rules: [
    { when: { phase: 'post_response' }, then: [{ type: 'replace', predicate: { role: 'assistant' }, content: 'final' }] }
  ] } } } } });
  const result = await session.send('go');
  expect(result.records[0].content).toBe(kind === 'raw' ? 'raw' : 'final');
  expect(result.contexts.narrator.messages[0].content).toBe('final');
  expect(result.state.count).toBe(1);
});
test('cancel and validation failure while waiting for the player roll back all records and state', async () => {
  const gate = barrier(), started = barrier();
  const session = testMainSession(factory, source, async ({ agentId }, cb) => {
    if (agentId === 'judge') return;
    cb.onToken(`${patch}first\n\nsecond`); started.resolve(); await gate.promise;
  });
  await session.start();
  const baseline = session.snapshot();
  const work = session.send('go');
  await started.promise;
  await waitFor(session, view => view.reading);
  expect(session.view().state.count).toBe(2);
  await session.cancel();
  await expect(work).rejects.toThrow('cancelled');
  expect(session.view()).toEqual({ ...baseline, reading: null, pendingInput: null });
  gate.resolve();
  const fail = testMainSession(factory, source, async ({ agentId }, cb) => {
    if (agentId === 'judge') return;
    cb.onToken(`${patch}first\n\nsecond`);
    await waitFor(fail, view => view.reading);
    throw new Error('late model failure');
  });
  await expect(fail.send('go')).rejects.toThrow('late model failure');
  expect(fail.view().records[0].content).toBe('first');
  expect(fail.view().state.count).toBe(2);
  expect(fail.view().reading).toBeNull();
  expect(fail.failed).toBe(true);
  expect(fail.running).toBe(false);
  expect(() => fail.exportSession()).toThrow('不能保存');
});
test('illegal patches, unconsumed readers and swallowed reader errors fail the whole round', async () => {
  for (const body of [
    "ctx.createReader({source:'unused', mode:'continuous'});",
    "try { await ctx.present(ctx.createReader({source:'<state_patch_stream>{\"secret\":1}</state_patch_stream>', mode:'segmented'})); } catch {}",
    "await ctx.present(ctx.createReader({source:'<state_patch_stream>bad</state_patch_stream>', mode:'segmented'}));"
  ]) {
    const session = testMainSession(factory, `export async function onInput(ctx) { ${body} }`);
    await expect(session.send('go')).rejects.toThrow();
    expect(session.snapshot().state.count).toBe(0);
  }
});
test('removed final message is absent; static display does not silently fall back to response', async () => {
  const session = testMainSession(factory, `export async function onInput(ctx) {
    const call = ctx.agents.call('narrator'); await call.done();
    const msg = ctx.agents.messages('narrator').find(m => m.id === call.messageId);
    if (msg) await ctx.present(ctx.createReader({source:msg.content, mode:'continuous'}));
  }`, async (_, cb) => cb.onToken('deleted'), { definition: { agents: { narrator: { definition: { model: 'default',
    rules: [{ when: { phase: 'post_response' }, then: [{ type: 'remove', predicate: { role: 'assistant' } }] }] } } } } });
  const result = await session.send('go');
  expect(result.records).toEqual([]);
  expect(result.contexts.narrator.messages).toEqual([]);
});
