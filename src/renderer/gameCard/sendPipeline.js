import { applyGameCardAsync } from './engine.js';
import { adaptMessagesToProtocol } from '../../shared/game-card/protocol/protocolAdapter.js';
import { loadCachedCardResources, loadCachedRuntimeCard, readCachedCardText } from './gameCardRuntimeCache.js';
import { applyLatestAssistantStatePatch } from '../../shared/game-card/state/statePatch.js';
import { decayTTL } from '../../shared/game-card/engine/ttl.js';
import { collectPresentationEffects } from '../../shared/game-card/engine/presentationActions.js';
import { prepareState } from './prepareState.js';

async function loadActiveGameCard(platform) {
  if (typeof platform?.repository?.getActiveCard !== 'function') return null;
  try {
    return await platform.repository.getActiveCard();
  } catch (_) {
    return null;
  }
}

async function loadCardResources(card, platform) {
  return loadCachedCardResources(card, platform?.resources);
}

function runtimeDependencies(platform, card) {
  const dependencies = platform?.scriptExecutor ? { scriptExecutor: platform.scriptExecutor } : {};
  if (card?.id && typeof platform?.resources?.readText === 'function') {
    dependencies.readText = filePath => readCachedCardText(card, platform.resources, filePath);
  }
  return dependencies;
}

async function preparePreSendMessages({ messages = [], state = {}, event = {}, card, protocol = 'openai', platform, observer } = {}) {
  const activeCard = card === undefined ? await loadActiveGameCard(platform) : card;
  if (!activeCard) {
    return { messages, state, trace: null, ttlTrace: null, applied: false, card: null };
  }
  let resources;
  try {
    resources = await loadCardResources(activeCard, platform);
  } catch (error) {
    return { messages, state, trace: null, ttlTrace: null, stateTrace: null, applied: false, card: null, error: error.message };
  }
  const prepared = prepareState(resources.card, state);
  observer?.('state.defaults', { result: prepared.trace }, messages, prepared.state);
  const ttl = decayTTL(messages);
  observer?.('messages.ttl', { result: ttl.trace }, ttl.messages, prepared.state);
  const result = await applyGameCardAsync({ card: resources.card, phase: 'pre_send', messages: ttl.messages, state: prepared.state, event, observer, fileContents: resources.fileContents, dependencies: runtimeDependencies(platform, resources.card) });
  return {
    ...result,
    presentationEffects: collectPresentationEffects(result.trace),
    ...(result.trace.errors.length ? { error: result.trace.errors.join('\n') } : {}),
    ttlTrace: ttl.trace,
    stateTrace: prepared.trace,
    applied: true,
    card: resources.card,
    protocol
  };
}

async function prepareAfterResponseMessages({
  messages = [],
  state = {},
  event = {},
  card,
  platform,
  observer,
  statePatchesApplied = false
} = {}) {
  const activeCard = card === undefined ? await loadActiveGameCard(platform) : card;
  if (!activeCard) {
    return { messages, state, trace: null, ttlTrace: null, applied: false, card: null };
  }
  let resources;
  try {
    resources = await loadCardResources(activeCard, platform);
  } catch (error) {
    return { messages, state, trace: null, ttlTrace: null, stateTrace: null, applied: false, card: null, error: error.message };
  }
  const prepared = prepareState(resources.card, state);
  observer?.('state.defaults', { result: prepared.trace }, messages, prepared.state);
  const patched = statePatchesApplied
    ? {
      state: prepared.state,
      trace: { applied: false, reason: 'already_applied', patches: [], changedKeys: [] }
    }
    : applyLatestAssistantStatePatch(messages, prepared.state, {
      messages,
      observer,
      schema: resources.card?.state?.schema
    });
  observer?.('state.patch', { result: patched.trace }, messages, patched.state);
  const result = await applyGameCardAsync({ card: resources.card, phase: 'after_response', messages, state: patched.state, event, observer, fileContents: resources.fileContents, dependencies: runtimeDependencies(platform, resources.card) });
  return {
    ...result,
    presentationEffects: collectPresentationEffects(result.trace),
    ttlTrace: null,
    stateTrace: prepared.trace,
    statePatchTrace: patched.trace,
    applied: true,
    card: resources.card
  };
}

async function prepareAfterStreamMessages({
  messages = [], state = {}, event = {}, card, platform, observer
} = {}) {
  const activeCard = card === undefined ? await loadActiveGameCard(platform) : card;
  if (!activeCard) return { messages, state, trace: null, applied: false, card: null };
  let resources;
  try {
    resources = await loadCardResources(activeCard, platform);
  } catch (error) {
    return { messages, state, trace: null, applied: false, card: null, error: error.message };
  }
  const prepared = prepareState(resources.card, state);
  observer?.('state.defaults', { result: prepared.trace }, messages, prepared.state);
  const result = await applyGameCardAsync({
    card: resources.card, phase: 'after_stream', messages, state: prepared.state,
    event, observer, fileContents: resources.fileContents, dependencies: runtimeDependencies(platform, resources.card)
  });
  return {
    ...result,
    presentationEffects: collectPresentationEffects(result.trace),
    stateTrace: prepared.trace,
    applied: true,
    card: resources.card
  };
}

function hasMessageChanges(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function prepareInitMessages({ messages = [], state = {}, event = {}, card, platform, observer } = {}) {
  const activeCard = card === undefined ? await loadActiveGameCard(platform) : card;

  if (!activeCard) {
    return { messages, state, trace: null, ttlTrace: null, applied: false, changed: false, card: activeCard || null };
  }

  if (messages.length > 0) {
    try {
      const cardWithSchema = await loadCachedRuntimeCard(activeCard, platform?.resources);
      const prepared = prepareState(cardWithSchema, state);
      observer?.('state.defaults', { result: prepared.trace }, messages, prepared.state);
      return {
        messages,
        state: prepared.state,
        trace: null,
        ttlTrace: null,
        stateTrace: prepared.trace,
        applied: false,
        changed: prepared.trace.changed,
        card: cardWithSchema
      };
    } catch (error) {
      return { messages, state, trace: null, ttlTrace: null, stateTrace: null, applied: false, changed: false, card: null, error: error.message };
    }
  }

  let resources;
  try {
    resources = await loadCardResources(activeCard, platform);
  } catch (error) {
    return { messages, state, trace: null, ttlTrace: null, stateTrace: null, applied: false, changed: false, card: null, error: error.message };
  }
  const prepared = prepareState(resources.card, state);
  observer?.('state.defaults', { result: prepared.trace }, messages, prepared.state);

  const result = await applyGameCardAsync({ card: resources.card, phase: 'init', messages, state: prepared.state, event, observer, fileContents: resources.fileContents, dependencies: runtimeDependencies(platform, resources.card) });
  const changed = hasMessageChanges(messages, result.messages) || hasMessageChanges(state, result.state) || prepared.trace.changed;
  return { ...result, ttlTrace: null, stateTrace: prepared.trace, applied: true, changed, card: resources.card };
}

function toApiMessages(messages) {
  return adaptMessagesToProtocol(messages, 'openai').messages;
}

export {
  adaptMessagesToProtocol,
  loadActiveGameCard,
  loadCardResources,
  prepareAfterResponseMessages,
  prepareAfterStreamMessages,
  prepareInitMessages,
  preparePreSendMessages,
  prepareState,
  toApiMessages
};
