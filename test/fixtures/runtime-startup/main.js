export async function onStart(ctx) {
  if (ctx.agents.messages('judge')[0].content !== 'judge-ready') throw new Error('missing init');
  const opening = ctx.agents.messages('narrator').find(msg => msg._meta?.source === 'opening');
  await ctx.present(ctx.createReader({ source: opening.content, mode: 'segmented' }));
  ctx.state.set('count', ctx.state.get('count') + 1);
}
export async function onInput() {}
