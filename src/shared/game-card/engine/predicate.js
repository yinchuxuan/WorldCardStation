import { getStateValue, hasStateValue } from '../state/statePaths.js';
import { childObserver, evaluateConditions } from '../trace/conditions.js';

function compareNumber(actual, expected, observer) {
  if (typeof expected === 'number') return actual === expected;
  if (!expected || typeof expected !== 'object') return false;

  return evaluateConditions(Object.entries(expected), ([op, value]) => {
    if (op === 'gt') return actual > value;
    if (op === 'gte') return actual >= value;
    if (op === 'lt') return actual < value;
    if (op === 'lte') return actual <= value;
    if (op === 'eq') return actual === value;
    return false;
  }, observer, { actual: () => actual });
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function matchesStateOperator(actual, exists, op, expected) {
  if (op === 'exists') return expected === exists;
  if (!exists) return false;
  if (op === 'eq') return actual === expected;
  if (op === 'gt') return typeof actual === typeof expected && actual > expected;
  if (op === 'gte') return typeof actual === typeof expected && actual >= expected;
  if (op === 'lt') return typeof actual === typeof expected && actual < expected;
  if (op === 'lte') return typeof actual === typeof expected && actual <= expected;
  if (op === 'in') return Array.isArray(expected) && expected.includes(actual);
  if (op === 'nin') return Array.isArray(expected) && !expected.includes(actual);
  if (op === 'contains' && typeof actual === 'string') return actual.includes(expected);
  if (op === 'contains' && Array.isArray(actual)) return actual.includes(expected);
  if (op === 'regex' && typeof actual === 'string') {
    try {
      return new RegExp(expected).test(actual);
    } catch {
      return false;
    }
  }
  return false;
}

function matchesStateValue(state, path, expected, observer) {
  const exists = hasStateValue(state, path);
  const actual = getStateValue(state, path);
  if (!isObject(expected)) return exists && actual === expected;

  return evaluateConditions(Object.entries(expected), ([op, value]) => {
    return matchesStateOperator(actual, exists, op, value);
  }, observer, { actual: () => ({ exists, value: actual }) });
}

function matchesState(statePredicate, state, observer) {
  if (!isObject(statePredicate) || Object.keys(statePredicate).length === 0) {
    return false;
  }
  return evaluateConditions(Object.entries(statePredicate), ([path, expected]) => {
    return matchesStateValue(state, path, expected, childObserver(observer, `/${path.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  }, observer, { actual: ([path]) => ({ exists: hasStateValue(state, path), value: getStateValue(state, path) }) });
}

function getValue(message, key) {
  if (key === '_meta.source') return message?._meta?.source;
  if (key === '_meta.visibility') return message?._meta?.visibility;
  return message?.[key];
}

function matchesString(actual, expected, observer) {
  if (typeof expected === 'string') return actual === expected;
  if (typeof actual !== 'string' || !expected || typeof expected !== 'object') {
    return false;
  }

  return evaluateConditions(Object.entries(expected), ([op, value]) => {
    if (op === 'contains') return actual.includes(value);
    if (op === 'regex') {
      try {
        return new RegExp(value).test(actual);
      } catch {
        return false;
      }
    }
    if (op === 'in') return Array.isArray(value) && value.includes(actual);
    if (op === 'nin') return Array.isArray(value) && !value.includes(actual);
    return false;
  }, observer, { actual: () => actual });
}

function matchesIndex(index, length, expected) {
  if (expected === 'last') return index === length - 1;
  return index === expected;
}

function matchesOccurrence(messages, index, role, expected) {
  if (typeof role !== 'string') return false;
  const last = messages.reduce((found, message, current) => (
    message?.role === role ? current : found
  ), -1);
  if (expected === 'last') return index === last;
  if (expected === 'not_last') return index !== last;
  return false;
}

function matchesPredicate(predicate, message, index, messages, observer) {
  if (!predicate || typeof predicate !== 'object') return false;
  const entries = Object.entries(predicate);
  if (entries.length === 0) return false;

  return evaluateConditions(entries, ([key, expected]) => {
    if (key === 'all') return expected === true;
    if (key === 'or') {
      return evaluateConditions(expected.map((item, i) => [i, item]), ([i, item]) =>
        matchesPredicate(item, message, index, messages, childObserver(observer, `/or/${i}`)),
      childObserver(observer, '/or'), { some: true });
    }
    if (key === 'not') return !matchesPredicate(expected, message, index, messages, childObserver(observer, '/not'));
    if (key === 'index') return matchesIndex(index, messages.length, expected);
    if (key === 'occurrence') return matchesOccurrence(messages, index, predicate.role, expected);
    if (key === 'role' || key === 'content' || key === 'thinking' || key === '_meta.source' || key === '_meta.visibility') {
      return matchesString(getValue(message, key), expected, childObserver(observer, `/${key}`));
    }
    return false;
  }, observer, { actual: ([key]) => ({ index, value: key === 'index' ? index : getValue(message, key) }) });
}

function withoutNum(predicate) {
  const rest = { ...(predicate || {}) };
  delete rest.num;
  return rest;
}

function matchesLast(last, messages, observer) {
  if (!last || typeof last !== 'object') return false;
  if (last.num === undefined) {
    const index = messages.length - 1;
    return index >= 0 && matchesPredicate(last, messages[index], index, messages, observer);
  }

  if (!Number.isInteger(last.num) || last.num < 1) return false;
  const predicate = withoutNum(last);
  if (Object.keys(predicate).length === 0) return false;
  const start = Math.max(messages.length - last.num, 0);
  return evaluateConditions(messages.slice(start).map((msg, offset) => [offset, msg]), ([offset, msg]) => {
    const index = start + offset;
    return matchesPredicate(predicate, msg, index, messages, childObserver(observer, `/messages/${index}`));
  }, childObserver(observer, '/messages'), { some: true });
}

function matchesWhen(when, phase, messages, state = {}, observer) {
  if (!when) return false;
  const keys = ['phase', 'length', 'last', 'any', 'all', 'state'].filter(key => key === 'phase' || when[key] !== undefined);
  return evaluateConditions(keys.map(key => [key, when[key]]), ([key, expected]) => {
    const child = childObserver(observer, `/${key}`);
    if (key === 'phase') return expected === phase;
    if (key === 'length') return compareNumber(messages.length, expected, child);
    if (key === 'last') return matchesLast(expected, messages, child);
    if (key === 'state') return matchesState(expected, state, child);
    return evaluateConditions(messages.map((msg, index) => [index, msg]), ([index, msg]) =>
      matchesPredicate(expected, msg, index, messages, childObserver(child, `/messages/${index}`)),
    childObserver(child, '/messages'), { some: key === 'any' });
  }, observer, { actual: ([key]) => key === 'phase' ? phase : key === 'length' ? messages.length : undefined });
}

export { compareNumber, matchesPredicate, matchesWhen, matchesLast, matchesState };
