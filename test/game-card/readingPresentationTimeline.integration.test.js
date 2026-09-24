import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';
import { barrier } from './agentRuntimeHelpers.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
function waitFor(session, predicate) {
  if (predicate(session.view())) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const stop = session.subscribe((view, detail) => {
      if (detail.type === 'failed') { stop(); reject(new Error('reader round failed')); }
      else if (predicate(view)) { stop(); resolve(); }
    });
  });
}
const source = `export async function onInput(ctx) {
  const call = ctx.agents.call('narrator');
  await ctx.present(ctx.createReader({source:call.response,mode:'segmented'}));
  await call.done();
}`;
const patch = value => `<state_patch_stream>${JSON.stringify(value)}</state_patch_stream>`;
const content = `${patch({ 'visual.scene': 'first' })}第一段。\n\n`
  + `${patch({ 'visual.scene': 'second', 'visual.portraits': { hero: 'normal' }, 'audio.bgm': 'tense' })}第二段。\n\n`;

test.each([false, true])('reading controls media State even when model completion is delayed: %s', async delayed => {
  const gate = barrier();
  const session = testMainSession(factory, source, async (_, cb) => {
    cb.onToken(content);
    if (delayed) await gate.promise;
  }, { definition: { stateSchema: {
    'visual.scene': { type: 'enum', values: ['old', 'first', 'second'], default: 'old', llmWrite: true },
    'visual.portraits': { type: 'object', default: {}, llmWrite: true },
    'audio.bgm': { type: 'enum', values: ['calm', 'tense'], default: 'calm', llmWrite: true }
  } } });
  let work;
  try {
    work = session.send('继续');
    await waitFor(session, view => view.reading && view.records[0]?.content.includes('第一段'));
    expect(session.view().state).toEqual({ visual: { scene: 'first', portraits: {} }, audio: { bgm: 'calm' } });
    expect(session.view().records[0].content).not.toContain('第二段');
    session.advance();
    await waitFor(session, view => view.reading && view.records[0]?.content.includes('第二段'));
    const second = session.view();
    expect(second.state).toEqual({ visual: { scene: 'second', portraits: { hero: 'normal' } }, audio: { bgm: 'tense' } });
    gate.resolve();
    await waitFor(session, view => view.contexts.narrator.messages.some(msg => msg.role === 'assistant'));
    expect(session.view().records).toEqual(second.records);
    expect(session.view().state).toEqual(second.state);
    session.advance();
    await work;
    expect(session.snapshot().state).toEqual(second.state);
    expect(session.snapshot().records).toEqual(second.records);
  } finally { gate.resolve(); await session.dispose(); await work?.catch(() => {}); }
});
