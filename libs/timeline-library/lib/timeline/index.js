/* eslint-disable no-unused-vars */
/* global include, loadTimelineConfig, resolveTimeline */

include("./core.js");

async function run(ctx) {
  const timeline = ctx.state.timeline;
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) {
    throw new Error('timeline state.timeline must be an object with currentTime');
  }
  const config = await loadTimelineConfig(ctx);
  const result = resolveTimeline(config, timeline);
  ctx.state.timeline = {
    ...timeline,
    currentTime: result.currentTime,
    currentSlot: result.slot.id,
    currentSlotEnd: result.slot.end ?? '',
    data: result.slot.data ?? {}
  };
  return { state: ctx.state, effects: { timeline: result.diagnostics } };
}
