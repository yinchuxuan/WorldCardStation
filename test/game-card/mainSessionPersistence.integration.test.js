import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';
import { createWebSessions } from '../../src/web/sessions.js';
import { validateRuntimeSession } from '../../src/shared/game-card/runtime/sessionSnapshot.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
const source = `export async function onInput(ctx, input) {
  ctx.state.set('input', input);
  await ctx.agents.call('judge').done();
  const call = ctx.agents.call('narrator');
  await ctx.present(ctx.createReader({source: call.response, mode: 'segmented'}));
  await call.done();
}`;
const rules = [{ when: { phase: 'init' }, then: [{ type: 'insert', role: 'system', content: 'init-once', ttl: -1 }] }];
const definition = { agents: {
  judge: { definition: { model: 'default', rules } },
  narrator: { definition: { model: 'default', rules: [...rules,
    { when: { phase: 'post_response' }, then: [{ type: 'replace', predicate: { role: 'assistant' }, content: 'final-msg' }] }] } },
  unused: { definition: { model: 'default', rules } }
} };
function session(seen = []) {
  return testMainSession(factory, source, async (request, cb) => {
    seen.push(request);
    cb.onToken(request.agentId === 'judge' ? 'hidden' : 'raw first<state_patch_stream>[{"type":"state.inc","path":"count","value":1}]</state_patch_stream>raw second');
  }, { definition });
}
async function play(runtime, input = 'go', retry = false) {
  const stop = runtime.subscribe(view => { if (view.reading) runtime.advance(); });
  try { await (retry ? runtime.retry(input) : runtime.send(input)); } finally { stop(); }
}
const copy = value => value && JSON.parse(JSON.stringify(value));
function repository() {
  const data = new Map();
  const store = { get: async key => copy(data.get(key)), update: async (key, fn) => {
    const value = fn(copy(data.get(key))); data.set(key, copy(value)); return value;
  } };
  return { store, create: () => createWebSessions({ scope: async () => ({ key: 'card/version' }), store, selection: null }) };
}

test('complete real Worker → repository → new instance restores actual records, all contexts and next-round init', async () => {
  const first = session(); await play(first);
  first.setViewState({ reading: { messageId: first.snapshot().records[0].id, segmentIndex: 0 },
    presentation: { background: { visual: { scene: 'room' } }, bgm: null } });
  const saved = first.exportSession();
  const repo = repository().create(), target = await repo.loadHistory();
  const archive = await repo.saveHistory(saved.current.messages, { runtimeSession: saved, saveTarget: target.saveTarget, asNew: true });
  expect(archive.saveTarget.id).not.toBe(target.saveTarget.id);
  await first.dispose();
  const seen = [], restored = session(seen);
  const loaded = await repo.loadHistory();
  await restored.beginLoad(); restored.restoreHistory(loaded);
  expect(restored.exportSession()).toEqual(saved);
  expect(restored.snapshot().contexts.narrator.messages.at(-1).content).toBe('final-msg');
  expect(restored.snapshot().records[0].content).toBe('raw first\n\nraw second');
  expect(restored.snapshot().messages[0]).toMatchObject({ role: 'user', content: 'go' });
  expect(restored.snapshot().state.count).toBe(1);
  expect(seen).toEqual([]);
  expect(restored.advance()).toBe(false);
  await play(restored, 'next');
  expect(seen[0].messages.filter(msg => msg.content === 'init-once')).toHaveLength(1);
  expect(seen[0].messages.at(-1).content).toBe('hidden');
  expect(restored.snapshot().contexts.unused).toEqual({ initialized: true,
    messages: [{ id: 'msg-round-1-3', role: 'system', content: 'init-once', ttl: -1 }] });
  expect(restored.snapshot().state.count).toBe(2);
  expect(restored.snapshot().contexts.judge.messages.map(msg => msg.id)).toEqual(['msg-round-1-1', 'msg-round-2-1', 'msg-round-3-1']);
  await restored.dispose();
});
test('persisted whole-round retry restores both Agents, variables and user/display records without duplication', async () => {
  const first = session(); await play(first);
  const saved = first.exportSession(), next = session(); next.restoreHistory({ runtimeSession: saved });
  await play(next, 'edited', true);
  expect(next.snapshot().state.count).toBe(1);
  expect(next.snapshot().records).toHaveLength(1);
  expect(next.snapshot().messages).toHaveLength(2);
  expect(next.snapshot().messages[0].content).toBe('edited');
  expect(next.snapshot().contexts.judge.messages).toHaveLength(2);
  await first.dispose(); await next.dispose();
});
test('reading and generation cannot be saved; cancel restores a saveable whole round', async () => {
  const runtime = session();
  let opened;
  const ready = new Promise(resolve => { opened = resolve; });
  const stop = runtime.subscribe(view => { if (view.reading) opened(); });
  const work = runtime.send('go'); await ready;
  expect(() => runtime.exportSession()).toThrow('不能保存');
  await runtime.cancel(); await expect(work).rejects.toThrow('cancelled'); stop();
  expect(runtime.exportSession().current.messages).toEqual([]);
  expect(runtime.snapshot().state.count).toBe(0);
  await runtime.dispose();
});
test('damaged/foreign/legacy data cannot overwrite or enable a failed load, and empty Session resets all Agents', async () => {
  const runtime = session(); await play(runtime); const saved = runtime.exportSession();
  for (const damage of [v => { v.version = 9; }, v => { v.cardId = 'foreign'; }, v => { v.sequence = 0; },
    v => { delete v.current.contexts.judge; }, v => { v.current.contexts.judge.initialized = false; },
    v => { v.current.state.count = 'invalid'; }, v => { v.current.records[0].units = []; },
    v => { v.viewState.reading = { messageId: 'missing', segmentIndex: 0 }; }]) {
    const broken = copy(saved); damage(broken);
    await runtime.beginLoad();
    expect(() => runtime.restoreHistory({ runtimeSession: broken })).toThrow();
    await expect(runtime.send('unsafe')).rejects.toThrow('尚未成功加载');
    expect(() => runtime.exportSession()).toThrow();
    runtime.restoreHistory({ runtimeSession: saved });
  }
  expect(() => runtime.restoreHistory({ messages: [{ content: 'old' }], gameState: {} })).toThrow('旧版');
  runtime.restoreHistory({ messages: [], gameState: {} });
  expect(runtime.snapshot().contexts.judge.initialized).toBe(false);
  expect(runtime.snapshot().messages).toEqual([]);
  await runtime.dispose();
});
test('failed storage leaves archive intact; corrupt source is protected and explicit target remains isolated', async () => {
  const runtime = session(); await play(runtime); const saved = runtime.exportSession();
  const { create, store } = repository(), repo = create(); const original = await repo.loadHistory();
  const options = { runtimeSession: saved, saveTarget: original.saveTarget, asNew: true };
  await repo.saveHistory(saved.current.messages, options);
  const before = await repo.loadHistory();
  const update = store.update; store.update = async () => { throw new Error('quota'); };
  await expect(repo.saveHistory([], options)).rejects.toThrow('quota'); store.update = update;
  expect(await repo.loadHistory()).toEqual(before);
  await repo.create('other'); expect((await repo.loadHistory()).runtimeSession).toBeUndefined();
  await repo.setActive(before.saveTarget.id);
  expect((await repo.loadHistory()).runtimeSession).toEqual(saved);
  await store.update('card/version', record => { record.sessions.find(s => s.id === before.saveTarget.id).snapshot.runtimeSession.version = 99; return record; });
  await expect(repo.loadHistory()).rejects.toThrow('已损坏');
  await expect(repo.saveHistory([], { ...options, saveTarget: before.saveTarget })).rejects.toThrow('已损坏');
  expect(() => validateRuntimeSession({ ...saved, sequence: -1 })).toThrow();
  await runtime.dispose();
});
