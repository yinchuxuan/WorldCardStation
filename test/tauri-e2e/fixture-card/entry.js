export async function onInput(ctx, input) {
  ctx.state.set('input', input);
  const call = ctx.agents.call('narrator');
  await ctx.present(ctx.createReader({ source: call.response, mode: 'continuous' }));
  await call.done();
}
