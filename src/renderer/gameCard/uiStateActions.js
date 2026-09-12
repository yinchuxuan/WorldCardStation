import { applyStateAction } from '../../shared/game-card/state/stateActions.js';
import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';
import { loadCachedRuntimeCard } from './gameCardRuntimeCache.js';

const MAX_UI_STATE_ACTIONS = 50;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function fail(reason, state, extra = {}) {
  return {
    applied: false,
    state: cloneJson(state || {}),
    trace: { type: 'game.state.apply', applied: false, reason, actions: [], changedKeys: [], ...extra }
  };
}

function normalizeUiStateActions(event) {
  if (event?.type !== 'game.state.apply') return { ok: false, reason: 'unsupported_event' };
  const rawActions = Array.isArray(event.actions)
    ? event.actions
    : (isObject(event.action) ? [event.action] : []);
  if (rawActions.length === 0) return { ok: false, reason: 'missing_actions' };
  if (rawActions.length > MAX_UI_STATE_ACTIONS) return { ok: false, reason: 'too_many_actions' };
  const invalid = rawActions.find((action) => !isObject(action) || !String(action.type || '').startsWith('state.'));
  if (invalid) return { ok: false, reason: 'unsupported_action' };
  return { ok: true, actions: cloneJson(rawActions) };
}

async function applyUiStateActionEvent({ event, state = {}, messages = [], card = null, platform = null, observer } = {}) {
  const normalized = normalizeUiStateActions(event);
  if (!normalized.ok) return fail(normalized.reason, state);

  let runtimeCard;
  try {
    runtimeCard = await loadCachedRuntimeCard(card, platform?.resources);
  } catch (error) {
    return fail('load_card_failed', state, { error: error.message });
  }

  const schema = runtimeCard?.state?.schema;
  const result = normalized.actions.reduce((current, action, index) => {
    observer?.('ui.action.start', { index, action }, messages, current.state);
    const applied = applyStateAction(current.state, action, { messages, schema, observer });
    observer?.('ui.action.end', { index, result: applied.trace }, messages, applied.state);
    return {
      state: applied.state,
      actions: [...current.actions, applied.trace]
    };
  }, { state: cloneJson(state || {}), actions: [] });
  const changedKeys = result.actions.reduce((keys, actionTrace) => {
    (actionTrace.summary?.state?.changedKeys || []).forEach((key) => keys.add(key));
    return keys;
  }, new Set());

  return {
    applied: result.actions.some((actionTrace) => actionTrace.applied),
    state: result.state,
    card: runtimeCard,
    trace: {
      type: 'game.state.apply',
      applied: result.actions.some((actionTrace) => actionTrace.applied),
      actions: result.actions,
      changedKeys: [...changedKeys]
    }
  };
}

export { applyUiStateActionEvent, normalizeUiStateActions };
