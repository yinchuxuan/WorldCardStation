import { resolveContent } from '../content/contentResolver.js';
import { withFindState } from './findResolver.js';
import { matchesPredicate, matchesWhen } from './predicate.js';
import { applyStateAction } from '../state/stateActions.js';
import { applyPresentationAction, isPresentationAction } from './presentationActions.js';

function findMatchingIndexes(messages, predicate) {
  return messages.reduce((indexes, message, index) => {
    if (matchesPredicate(predicate, message, index, messages)) {
      return [...indexes, index];
    }
    return indexes;
  }, []);
}

function summarizeMessages(before, after, type, matched) {
  return {
    before: before.length,
    after: after.length,
    inserted: type === 'insert' && after.length > before.length ? 1 : 0,
    removed: type === 'remove' ? before.length - after.length : 0,
    replaced: type === 'replace' ? matched : 0
  };
}

function buildTrace(action, matches, applied, before, after, stateSummary) {
  const type = action?.type || (Array.isArray(action?.then) ? 'group' : 'unknown');
  return {
    type,
    applied,
    matched: matches.length,
    summary: {
      messages: summarizeMessages(before, after, type, matches.length),
      state: stateSummary || { changedKeys: [] }
    }
  };
}

function skippedTrace(action, messages, reason) {
  return {
    ...buildTrace(action, [], false, messages, messages),
    ...(reason ? { reason } : {})
  };
}

function insertMessage(action, options) {
  return {
    role: action.role, content: resolveContent(action.content, {}, options),
    ...(action.ttl !== undefined ? { ttl: action.ttl } : {}),
    ...(action._meta ? { _meta: { ...action._meta } } : {})
  };
}

function applyInsert(messages, action, options) {
  if (!action.role || action.content === undefined) {
    return { messages, trace: buildTrace(action, [], false, messages, messages) };
  }

  if (action.predicate === undefined) {
    const nextMessages = [...messages, insertMessage(action, options)];
    return { messages: nextMessages, trace: buildTrace(action, [], true, messages, nextMessages) };
  }

  const matches = findMatchingIndexes(messages, action.predicate);
  if (matches.length === 0) return { messages, trace: buildTrace(action, matches, false, messages, messages) };

  const anchorIndex = matches[0] + (action.anchor === 'before' ? 0 : 1);
  const nextMessages = [
    ...messages.slice(0, anchorIndex),
    insertMessage(action, options),
    ...messages.slice(anchorIndex)
  ];
  return { messages: nextMessages, trace: buildTrace(action, matches, true, messages, nextMessages) };
}

function applyRemove(messages, action) {
  const matches = findMatchingIndexes(messages, action.predicate);
  if (matches.length === 0) return { messages, trace: buildTrace(action, matches, false, messages, messages) };

  const nextMessages = messages.filter((_, index) => !matches.includes(index));
  return { messages: nextMessages, trace: buildTrace(action, matches, true, messages, nextMessages) };
}

function applyReplace(messages, action, options) {
  const matches = findMatchingIndexes(messages, action.predicate);
  if (matches.length === 0) return { messages, trace: buildTrace(action, matches, false, messages, messages) };

  const nextMessages = messages.map((message, index) => {
    if (!matches.includes(index)) return message;
    return {
      ...message,
      ...(action.content !== undefined ? { content: resolveContent(action.content, message, { ...options, messages }) } : {}),
      ...(action.ttl !== undefined ? { ttl: action.ttl } : {}),
      ...(action._meta ? { _meta: { ...message._meta, ...action._meta } } : {})
    };
  });
  return { messages: nextMessages, trace: buildTrace(action, matches, true, messages, nextMessages) };
}

function applyAction(messages, action, options = {}) {
  if (action?.find) {
    const found = withFindState(options.state || {}, action.find, messages);
    const next = applyAction(messages, { ...action, find: undefined }, {
      ...options,
      state: found.state
    });
    return { ...next, state: found.restore(next.state || found.state) };
  }
  if (action?.when) {
    const phase = options.event?.phase || action.when.phase || 'pre_send';
    const when = action.when.phase ? action.when : { ...action.when, phase };
    if (!matchesWhen(when, phase, messages, options.state || {})) {
      return { messages, state: options.state || {}, trace: skippedTrace(action, messages, 'when_not_matched') };
    }
  }
  if (Array.isArray(action?.then) && action.type === undefined) return applyActionGroup(messages, action, options);
  if (action?.type === 'insert') return applyInsert(messages, action, { ...options, messages });
  if (action?.type === 'remove') return applyRemove(messages, action);
  if (action?.type === 'replace') return applyReplace(messages, action, options);
  if (action?.type?.startsWith('state.')) {
    const result = applyStateAction(options.state || {}, action, {
      messages,
      schema: options.card?.state?.schema
    });
    return { messages, state: result.state, trace: result.trace };
  }
  if (isPresentationAction(action)) return applyPresentationAction(messages, options.state || {}, action);
  if (action?.type === 'exec') {
    if (typeof options.runExecAction !== 'function') throw new Error('exec runner is required');
    return options.runExecAction(messages, options.state || {}, action, options);
  }

  return {
    messages,
    state: options.state || {},
    trace: {
      type: action?.type || 'unknown',
      applied: false,
      reason: 'not_implemented',
      summary: {
        messages: summarizeMessages(messages, messages, 'unknown', 0),
        state: { changedKeys: [] }
      }
    }
  };
}

function applyActionGroup(messages, action, options) {
  const result = applyActions(messages, action.then, options);
  return {
    messages: result.messages,
    state: result.state,
    trace: {
      type: 'group',
      applied: result.trace.some((item) => item.applied),
      matched: 1,
      actions: result.trace,
      summary: {
        messages: summarizeGroupMessages(messages, result.messages, result.trace),
        state: summarizeGroupState(result.trace)
      }
    }
  };
}

function summarizeGroupMessages(before, after, traces) {
  return {
    before: before.length,
    after: after.length,
    inserted: sumTraceMessages(traces, 'inserted'),
    removed: sumTraceMessages(traces, 'removed'),
    replaced: sumTraceMessages(traces, 'replaced')
  };
}

function summarizeGroupState(traces) {
  const changed = new Set();
  traces.forEach((trace) => (trace.summary?.state?.changedKeys || []).forEach((key) => changed.add(key)));
  return { changedKeys: [...changed] };
}

function sumTraceMessages(traces, key) {
  return traces.reduce((total, trace) => total + (trace.summary?.messages?.[key] || 0), 0);
}

function applyActions(messages, actions = [], options = {}) {
  return actions.reduce((result, action) => {
    const next = applyAction(result.messages, action, { ...options, state: result.state });
    return {
      messages: next.messages,
      state: next.state || result.state,
      trace: [...result.trace, next.trace]
    };
  }, { messages, state: options.state || {}, trace: [] });
}

export { applyAction, applyActions };
