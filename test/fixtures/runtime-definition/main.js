import { settle } from './logic.js';

export async function onInput(ctx, input) {
  ctx.state.set('turn.input', input);
  const judge = ctx.agents.call('judge');
  await judge.done();
  const message = ctx.agents.messages('judge').find(item => item.id === judge.messageId);
  ctx.state.set('turn.judgment', settle(message.content));
  await ctx.agents.call('narrator').done();
}
