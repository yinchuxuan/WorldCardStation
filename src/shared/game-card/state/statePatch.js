import { applyStateAction } from './stateActions.js';
import { cloneState, getStateValue } from './statePaths.js';

const PATCH_PATTERN = /<state_patch>([\s\S]*?)<\/state_patch>/g;

function findLatestAssistantMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') return messages[index];
  }
  return null;
}

function extractLatestAssistantStatePatches(messages = []) {
  const message = findLatestAssistantMessage(messages);
  if (!message || typeof message.content !== 'string') return [];
  return [...message.content.matchAll(PATCH_PATTERN)].map((match) => match[1].trim());
}

function normalizePatchActions(parsed) {
  if (Array.isArray(parsed) || !parsed || typeof parsed !== 'object') {
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'type')) return [parsed];
  return Object.entries(parsed).map(([path, value]) => ({
    type: 'state.set',
    path,
    value
  }));
}

function summarizeActions(actions) {
  return actions.reduce((keys, action) => {
    (action.summary?.state?.changedKeys || []).forEach((key) => keys.add(key));
    return keys;
  }, new Set());
}

function buildUpdate(action, before, applied) {
  if (!applied.trace.applied) return null;
  return {
    path: action.path,
    operation: action.type,
    before: getStateValue(before, action.path),
    after: getStateValue(applied.state, action.path)
  };
}

function applyParsedPatch(state, patchText, options) {
  let actions;
  try {
    actions = normalizePatchActions(JSON.parse(patchText));
  } catch (_) {
    return {
      state: cloneState(state),
      trace: {
        applied: false, reason: 'invalid_json', actions: [], updates: [], changedKeys: [], setPaths: []
      }
    };
  }

  const selectedActions = options.actionFilter
    ? actions.filter(options.actionFilter)
    : actions;
  const result = selectedActions.reduce((current, action, index) => {
    options.observer?.('patch.action.start', { index, action }, options.messages, current.state);
    const applied = applyStateAction(current.state, action, options);
    options.observer?.('patch.action.end', { index, result: applied.trace }, options.messages, applied.state);
    const update = buildUpdate(action, current.state, applied);
    return {
      state: applied.state,
      actions: [...current.actions, applied.trace],
      updates: update ? [...current.updates, update] : current.updates
    };
  }, { state: cloneState(state), actions: [], updates: [] });

  return {
    state: result.state,
    trace: {
      applied: result.actions.some((action) => action.applied),
      actions: result.actions,
      updates: result.updates,
      changedKeys: [...summarizeActions(result.actions)],
      setPaths: selectedActions
        .filter((action, index) => action?.type === 'state.set' && result.actions[index]?.applied)
        .map(action => action.path),
      ignoredPaths: actions
        .filter(action => !selectedActions.includes(action))
        .map(action => action?.path)
        .filter(Boolean)
    }
  };
}

function applyStatePatch(patchText, state = {}, options = {}) {
  return applyParsedPatch(state, patchText, options);
}

function applyLatestAssistantStatePatch(messages = [], state = {}, options = {}) {
  const patches = extractLatestAssistantStatePatches(messages);
  if (patches.length === 0) {
    return {
      state: cloneState(state),
      trace: {
        applied: false, reason: 'not_found', patches: [], updates: [], changedKeys: [], setPaths: []
      }
    };
  }

  return patches.reduce((current, patchText) => {
    const result = applyParsedPatch(current.state, patchText, options);
    return {
      state: result.state,
      trace: {
        applied: current.trace.applied || result.trace.applied,
        patches: [...current.trace.patches, result.trace],
        updates: [...current.trace.updates, ...(result.trace.updates || [])],
        changedKeys: [...new Set([...current.trace.changedKeys, ...result.trace.changedKeys])],
        setPaths: [...new Set([...current.trace.setPaths, ...result.trace.setPaths])]
      }
    };
  }, {
    state: cloneState(state),
    trace: { applied: false, patches: [], updates: [], changedKeys: [], setPaths: [] }
  });
}

export {
  applyLatestAssistantStatePatch,
  applyStatePatch,
  extractLatestAssistantStatePatches
};
