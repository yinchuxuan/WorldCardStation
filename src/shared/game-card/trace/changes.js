import { cloneJson } from '../utils/jsonValue.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointer = (path, key) => `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;

function stateChanges(before, after, path = '') {
  if (equal(before, after)) return [];
  if (!object(before) || !object(after)) return [{ path, before, after }];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => {
    const hasBefore = Object.hasOwn(before, key), hasAfter = Object.hasOwn(after, key);
    const nextPath = pointer(path, key);
    if (hasBefore && hasAfter) return stateChanges(before[key], after[key], nextPath);
    return [{ path: nextPath, hasBefore, hasAfter,
      ...(hasBefore ? { before: before[key] } : {}), ...(hasAfter ? { after: after[key] } : {}) }];
  });
}

function messageChanges(before, after, replace = false) {
  if (equal(before, after)) return null;
  if (replace) return { operation: 'replace', before, after };
  let start = 0, tail = 0;
  while (start < Math.min(before.length, after.length) && equal(before[start], after[start])) start += 1;
  while (tail < Math.min(before.length, after.length) - start
    && equal(before[before.length - 1 - tail], after[after.length - 1 - tail])) tail += 1;
  return { operation: 'splice', index: start,
    removed: before.slice(start, before.length - tail), added: after.slice(start, after.length - tail) };
}

function createTraceRecorder(write, initial, onFailure = () => {}) {
  let previous = cloneJson(initial);
  let sequence = 0;
  return (type, details = {}, messages, state) => {
    try {
      if (messages === undefined && state === undefined) {
        write(cloneJson({ type, sequence: sequence++, time: new Date().toISOString(), ...details,
          changes: { messages: null, state: [] } }));
        return;
      }
      const next = cloneJson({ messages: messages ?? previous.messages, state: state ?? previous.state });
      const changes = {
        messages: messageChanges(previous.messages, next.messages, details.actionType === 'exec'),
        state: stateChanges(previous.state, next.state)
      };
      write(cloneJson({ type, sequence: sequence++, time: new Date().toISOString(), ...details, changes }));
      previous = next;
    } catch (error) { onFailure(error); }
  };
}

export { createTraceRecorder, messageChanges, stateChanges };
