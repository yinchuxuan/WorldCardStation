/* eslint-disable no-unused-vars */
/* global include, worldbookInsert, worldbookLoad, worldbookResolveEntries, worldbookEnvironment */
/* global worldbookPrepareEntries, worldbookTiming */

include("./normalize.js");
include("./matcher.js");
include("./context.js");
include("./positions.js");
include("./decorators.js");
include("./macros.js");
include("./content.js");
include("./timing.js");
include("./groups.js");
include("./budget.js");
include("./resolver.js");
include("./examples.js");
include("./injector.js");

async function runWorldbook(ctx, args, renderText) {
  const scopeId = args?.worldbook;
  if (typeof scopeId !== 'string' || !scopeId) throw new Error('worldbook scope is required');
  const book = await worldbookLoad(ctx, scopeId);
  const env = worldbookEnvironment({ ...ctx, args }, book);
  if (renderText !== undefined && typeof renderText !== 'function') throw new Error('worldbook renderer must be a function');
  env.renderText = renderText;
  const items = await worldbookPrepareEntries(env, scopeId);
  const timing = worldbookTiming(env, scopeId, items);
  const selected = await worldbookResolveEntries(env, items, timing);
  const { messages, outlets } = worldbookInsert(env, scopeId, selected);
  const state = timing.finish(selected, outlets);
  return {
    messages, ...(state === undefined ? {} : { state }),
    effects: { worldbook: {
      scope: scopeId, selected: selected.map(item => item.entry.id),
      budget_skipped: env.budgetSkipped, outlets, warnings: env.warnings
    } }
  };
}

async function run(ctx) {
  return runWorldbook(ctx, ctx.args);
}
