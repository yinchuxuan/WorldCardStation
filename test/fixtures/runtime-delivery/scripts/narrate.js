export async function narrate(ctx) {
  const call = ctx.agents.call('narrator');
  await ctx.present(ctx.createReader({ source: call.response, mode: 'continuous' }));
  await call.done();
}
