/* eslint-disable no-unused-vars */

function parseTimelineTime(value, label = 'currentTime') {
  const match = typeof value === 'string' && value.trim().match(
    /^(\d{4})\.(\d{1,2})\.(\d{1,2}):\s*(\d{1,2}):(\d{2})(?:\s+星期[一二三四五六日天])?$/
  );
  if (!match) throw new Error(`timeline ${label}: invalid time ${JSON.stringify(value)}`);
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) {
    throw new Error(`timeline ${label}: invalid calendar time ${JSON.stringify(value)}`);
  }
  return date.getTime();
}

function clampTimelineTime(currentTime, currentSlotEnd) {
  const current = parseTimelineTime(currentTime);
  const previousEnd = currentSlotEnd === undefined || currentSlotEnd === '' ? null : currentSlotEnd;
  const end = previousEnd === null ? Infinity : parseTimelineTime(previousEnd, 'currentSlotEnd');
  const clamped = current > end;
  return { requestedTime: currentTime, previousEnd, currentTime: clamped ? previousEnd : currentTime, clamped };
}

function timelineRange(range, label) {
  if (!range || typeof range !== 'object' || Array.isArray(range)) {
    throw new Error(`timeline ${label}: range must be an object`);
  }
  const values = {};
  for (const key of Object.keys(range)) {
    if (!['gt', 'gte', 'lt', 'lte'].includes(key)) throw new Error(`timeline ${label}: unknown range operator ${key}`);
    values[key] = parseTimelineTime(range[key], `${label}.${key}`);
  }
  if (('gt' in values && 'gte' in values) || ('lt' in values && 'lte' in values)) {
    throw new Error(`timeline ${label}: use only one lower and one upper bound`);
  }
  const lower = values.gt ?? values.gte ?? -Infinity;
  const upper = values.lt ?? values.lte ?? Infinity;
  if (lower > upper || (lower === upper && ('gt' in values || 'lt' in values))) {
    throw new Error(`timeline ${label}: empty or reversed range`);
  }
  return values;
}

function timelineRangeMatches(time, range) {
  return (range.gt === undefined || time > range.gt)
    && (range.gte === undefined || time >= range.gte)
    && (range.lt === undefined || time < range.lt)
    && (range.lte === undefined || time <= range.lte);
}
