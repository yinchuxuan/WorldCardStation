import { buildMainWorkerFactory, testMainSession } from './mainWorkerTestHost.js';

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
const text = 'body<state_patch>{"count":99}</state_patch><state_patch_stream>{"count":88}</state_patch_stream>'
  + '<state_patch><state_patch_stream>nested</state_patch>unfinished<state_patch';

test.each(['continuous', 'segmented'])('card flag reaches Agent, validation and %s readers in the Worker', async mode => {
  const main = `export async function onInput(ctx) {
    ctx.state.set('count', 3);
    const call = ctx.agents.call('narrator');
    await ctx.present(ctx.createReader({source:call.response,mode:'${mode}'}), {waitForAdvance:false});
    await call.done();
    await ctx.present(ctx.createReader({source:ctx.agents.messages('narrator')[0].content,mode:'${mode}'}), {waitForAdvance:false});
  }`;
  const session = testMainSession(factory, main, async (_, cb) => {
    for (const char of text) cb.onToken(char);
  }, { definition: {
    card: { id: 'test', statePatch: { enabled: false } },
    agents: { narrator: { definition: { model: 'default', rules: [
      { when: { phase: 'post_response' }, then: [{ type: 'state.set', path: 'count', value: 4 }] }
    ], responseValidation: { rules: [
      { id: 'literal', type: 'content.regex', pattern: '99', matches: { eq: 1 }, message: 'literal tag content missing' }
    ] } } } }
  } });
  try {
    const result = await session.send('go');
    expect(result.state.count).toBe(4);
    expect(result.records.map(record => record.content)).toEqual([text, text]);
    expect(result.contexts.narrator.messages[0].content).toBe(text);
  } finally { await session.dispose(); }
});
