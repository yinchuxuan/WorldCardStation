import { executeMainRound } from '../../src/shared/game-card/runtime/mainRound.js';

const definition = { card: {}, stateSchema: {}, agents: { judge: { definition: { model: 'default', rules: [] } } } };
test('round exposes synchronous validated State and expires captured ctx', async () => {
  let ctx;
  const result = await executeMainRound({ definition, input: 'hello', onInput: async (context, input) => {
    ctx = context;
    ctx.state.set('input', input);
    await ctx.agents.call('judge').done();
    ctx.state.set('answer', ctx.agents.messages('judge')[0].content);
  }, generate: async (_, cb) => cb.onToken('ok') });
  expect(result.state).toMatchObject({ input: 'hello', answer: 'ok' });
  expect(() => ctx.state.set('late', true)).toThrow('expired');
  expect(() => ctx.agents.call('judge')).toThrow('expired');
});

test('unfinished calls and failures abort the round even if script swallows the error', async () => {
  await expect(executeMainRound({ definition, input: '', onInput: async ctx => { ctx.agents.call('judge'); },
    generate: () => new Promise(() => {}) })).rejects.toThrow('unfinished');
  await expect(executeMainRound({ definition, input: '', onInput: async ctx => {
    try { await ctx.agents.call('judge').done(); } catch { ctx.state.set('count', 3); }
  }, generate: async () => { throw new Error('failed'); } })).rejects.toThrow('failed');
});
