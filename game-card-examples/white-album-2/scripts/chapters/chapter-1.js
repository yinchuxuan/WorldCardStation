/* eslint-disable no-unused-vars */
/* global loadTimelineConfig, selectTimelineSlot */
/* exported resolveAttitudeSection, resolveChapter1EventCategory, resolveChapter1Timeline, resolvePlotMood */

function resolvePlotMood(roll) {
  if (roll <= 10) return 'tragic';
  if (roll < 30) return 'sad';
  if (roll < 70) return 'normal';
  if (roll < 90) return 'daily';
  return 'happy';
}

function resolveChapter1EventCategory(roll) {
  if (roll <= 50) return 'recruitment';
  if (roll <= 70) return 'friends';
  if (roll <= 85) return 'school';
  return 'personal';
}

function resolveAttitudeSection(prefix, affection, threshold) {
  return prefix + (affection >= threshold ? 'High' : 'Low');
}

async function resolveChapter1Timeline(state, ctx) {
  const config = await loadTimelineConfig(ctx, { ...ctx.args, config: 'chapter-1.json' });
  const { slot, diagnostics } = selectTimelineSlot(config, state.timeline.currentTime);
  return {
    chapter: 'chapter_1',
    plotFile: 'plot.chapter.1',
    plotType: slot.id,
    plotKind: slot.data.plotKind,
    end: slot.end,
    diagnostics
  };
}
