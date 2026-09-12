import { applyAction } from './actions.js';
import { withFindState } from './findResolver.js';
import { matchesWhen } from './predicate.js';
import { conditionObserver, observeNode } from '../trace/nodes.js';

function sumTrace(traces, group, key) {
  return traces.reduce((total, trace) => total + (trace.summary?.[group]?.[key] || 0), 0);
}

function groupTrace(messages, result) {
  const changed = new Set();
  result.trace.forEach(trace => (trace.summary?.state?.changedKeys || []).forEach(key => changed.add(key)));
  return {
    type: 'group', applied: result.trace.some(item => item.applied), matched: 1, actions: result.trace,
    summary: {
      messages: {
        before: messages.length, after: result.messages.length,
        inserted: sumTrace(result.trace, 'messages', 'inserted'),
        removed: sumTrace(result.trace, 'messages', 'removed'),
        replaced: sumTrace(result.trace, 'messages', 'replaced')
      },
      state: { changedKeys: [...changed] }
    }
  };
}

async function applyActionAsync(messages, action, options = {}) {
  if (action?.find) {
    const found = withFindState(options.state || {}, action.find, messages, options);
    const next = await applyActionAsync(messages, { ...action, find: undefined }, {
      ...options,
      state: found.state
    });
    return { ...next, state: found.restore(next.state || found.state) };
  }
  if (action?.when) {
    const phase = options.event?.phase || action.when.phase || 'pre_send';
    const when = action.when.phase ? action.when : { ...action.when, phase };
    if (!matchesWhen(when, phase, messages, options.state || {}, conditionObserver(options))) {
      return {
        messages,
        state: options.state || {},
        trace: {
          type: action.type || (Array.isArray(action.then) ? 'group' : 'unknown'),
          applied: false, matched: 0, reason: 'when_not_matched',
          summary: { messages: { before: messages.length, after: messages.length, inserted: 0, removed: 0, replaced: 0 }, state: { changedKeys: [] } }
        }
      };
    }
  }
  if (Array.isArray(action?.then) && action.type === undefined) {
    const result = await applyActionsAsync(messages, action.then, { ...options, pointer: `${options.pointer}/then` });
    return { messages: result.messages, state: result.state, trace: groupTrace(messages, result) };
  }
  if (action?.type === 'exec') {
    if (typeof options.runExecAction !== 'function') throw new Error('exec runner is required');
    return options.runExecAction(messages, options.state || {}, action, options);
  }
  return applyAction(messages, { ...action, when: undefined }, options);
}

async function applyActionsAsync(messages, actions = [], options = {}) {
  let result = { messages, state: options.state || {}, trace: [] };
  for (const [index, action] of actions.entries()) {
    const scoped = { ...options, pointer: `${options.pointer || ''}/${index}`, state: result.state };
    const next = await observeNode('action', result.messages, result.state, scoped,
      { actionType: action.type || 'group', action }, () => applyActionAsync(result.messages, action, scoped));
    result = { messages: next.messages, state: next.state || result.state, trace: [...result.trace, next.trace] };
  }
  return result;
}

export { applyActionAsync, applyActionsAsync };
