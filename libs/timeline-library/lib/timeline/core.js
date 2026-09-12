/* eslint-disable no-unused-vars */
/* global include, parseTimelineTime, clampTimelineTime, timelineRange, timelineRangeMatches */

include("./time.js");

function selectTimelineSlot(config, currentTime) {
  if (!config || !Array.isArray(config.slots) || !config.slots.length) {
    throw new Error('timeline config.slots must be a non-empty array');
  }
  const time = parseTimelineTime(currentTime);
  const ids = new Set();
  const matched = [];
  for (const [index, slot] of config.slots.entries()) {
    const label = `slots[${index}]`;
    if (!slot || typeof slot.id !== 'string' || !slot.id.trim()) {
      throw new Error(`timeline ${label}.id must be a non-empty string`);
    }
    if (ids.has(slot.id)) throw new Error(`timeline ${label}: duplicate slot id ${slot.id}`);
    ids.add(slot.id);
    if (slot.end !== null) parseTimelineTime(slot.end, `${label}.end`);
    if (slot.data !== undefined && (!slot.data || typeof slot.data !== 'object' || Array.isArray(slot.data))) {
      throw new Error(`timeline ${label}.data must be an object`);
    }
    const range = timelineRange(slot.range, `${label}.range`);
    if (timelineRangeMatches(time, range)) matched.push(slot);
  }
  if (config.fallback !== undefined && !ids.has(config.fallback)) {
    throw new Error('timeline config.fallback must reference an existing slot id');
  }
  const fallbackUsed = !matched.length;
  const slot = matched[0] || config.slots.find(item => item.id === config.fallback);
  if (!slot) throw new Error(`timeline: no slot matches ${currentTime}; configure an explicit fallback`);
  const warnings = [];
  if (fallbackUsed) warnings.push(`No slot matched; using fallback ${slot.id}`);
  if (matched.length > 1) warnings.push(`Multiple slots matched; using first slot ${slot.id}`);
  return {
    slot: JSON.parse(JSON.stringify(slot)),
    diagnostics: { selected: slot.id, matched: matched.map(item => item.id), fallbackUsed, warnings }
  };
}

function resolveTimeline(config, input) {
  const time = clampTimelineTime(input.currentTime, input.currentSlotEnd);
  const selection = selectTimelineSlot(config, time.currentTime);
  return { currentTime: time.currentTime, slot: selection.slot, diagnostics: { ...time, ...selection.diagnostics } };
}

async function loadTimelineConfig(ctx, args = ctx.args) {
  const scope = args?.timeline;
  const file = args?.config ?? 'config.json';
  if (typeof scope !== 'string' || !scope) throw new Error('timeline scope is required');
  const text = await ctx.files.readText(scope, file);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid timeline config ${scope}/${file}: ${error.message}`);
  }
}
