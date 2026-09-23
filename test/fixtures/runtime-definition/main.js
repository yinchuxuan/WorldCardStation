export async function onInput(ctx, input) {
  ctx.state.set('turn.input', input);
  await ctx.agents.call('judge').done();
  const call = ctx.agents.call('narrator');
  await ctx.present(ctx.createReader({ source: call.response, mode: 'segmented' }));
  await call.done();
}
