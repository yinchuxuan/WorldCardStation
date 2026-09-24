import { narrate } from './scripts/narrate.js';

export async function onInput(ctx, input) {
  ctx.state.set('turn.input', input);
  await ctx.agents.call('judge').done();
  await narrate(ctx);
}
