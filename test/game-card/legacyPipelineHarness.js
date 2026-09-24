import { applyGameCardAsync } from '../../src/renderer/gameCard/engine.js';
// Test-only adapter for legacy converter output and low-level rule contracts.
// Player generation uses mainSession/Agent Runtime exclusively.
import { adaptMessagesToProtocol } from '../../src/shared/game-card/protocol/protocolAdapter.js';
import { loadCachedCardResources, loadCachedRuntimeCard, readCachedCardText } from '../../src/renderer/gameCard/gameCardRuntimeCache.js';
import { applyLatestAssistantStatePatch } from '../../src/shared/game-card/state/statePatch.js';
import { decayTTL } from '../../src/shared/game-card/engine/ttl.js';
import { collectPresentationEffects } from '../../src/shared/game-card/engine/presentationActions.js';
import { prepareState } from '../../src/renderer/gameCard/prepareState.js';

async function loadActiveGameCard(platform) {
  if (typeof platform?.repository?.getActiveCard !== 'function') return null;
  return platform.repository.getActiveCard();
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

function preparePhaseInput(phase, messages, state, card, options) {
  const { observer, statePatchesApplied } = options;
  if (phase === 'pre_send') {
    const ttl = decayTTL(messages);
    observer?.('messages.ttl', { result: ttl.trace }, ttl.messages, state);
    return { messages: ttl.messages, state, ttlTrace: ttl.trace };
  }
  if (phase === 'after_response') {
    const patched = statePatchesApplied
      ? { state, trace: { applied: false, reason: 'already_applied', patches: [], changedKeys: [] } }
      : applyLatestAssistantStatePatch(messages, state, { messages, observer, schema: card?.state?.schema });
    observer?.('state.patch', { result: patched.trace }, messages, patched.state);
    return { messages, state: patched.state, ttlTrace: null, statePatchTrace: patched.trace };
  }
  return { messages, state, ttlTrace: null };
}

async function preparePhase(phase, options = {}) {
  const { messages = [], state = {}, event = {}, platform, observer } = options;
  const unchanged = { messages, state, trace: null, ttlTrace: null, applied: false, card: null,
    ...(phase === 'init' ? { changed: false } : {}) };
  let resources, prepared;
  const existingHistory = phase === 'init' && messages.length > 0;
  try {
    const card = options.card === undefined ? await loadActiveGameCard(platform) : options.card;
    if (!card) return unchanged;
    resources = existingHistory
      ? { card: await loadCachedRuntimeCard(card, platform?.resources) }
      : await loadCardResources(card, platform);
    prepared = prepareState(resources.card, state);
  } catch (error) {
    return { ...unchanged, stateTrace: null, error: error.message,
      stage: error.stage, file: error.file, details: error.details };
  }
  observer?.('state.defaults', { result: prepared.trace }, messages, prepared.state);
  if (existingHistory) return { ...unchanged, card: resources.card, state: prepared.state,
    stateTrace: prepared.trace, changed: prepared.trace.changed };
  const input = preparePhaseInput(phase, messages, prepared.state, resources.card, options);
  const result = await applyGameCardAsync({
    card: resources.card, phase, messages: input.messages, state: input.state, event, observer,
    fileContents: resources.fileContents, dependencies: runtimeDependencies(platform, resources.card)
  });
  const { ttlTrace, statePatchTrace } = input;
  return {
    ...result, ttlTrace, stateTrace: prepared.trace, applied: true, card: resources.card,
    ...(statePatchTrace ? { statePatchTrace } : {}),
    ...(phase === 'init' ? {
      changed: JSON.stringify(messages) !== JSON.stringify(result.messages)
        || JSON.stringify(state) !== JSON.stringify(result.state) || prepared.trace.changed
    } : { presentationEffects: collectPresentationEffects(result.trace) }),
    ...(phase === 'pre_send' ? {
      protocol: options.protocol || 'openai',
      ...(result.trace.errors.length ? { error: result.trace.errors.join('\n') } : {})
    } : {})
  };
}

function preparePreSendMessages(options) { return preparePhase('pre_send', options); }
function prepareAfterResponseMessages(options) { return preparePhase('after_response', options); }
function prepareAfterStreamMessages(options) { return preparePhase('after_stream', options); }
function prepareInitMessages(options) { return preparePhase('init', options); }

function toApiMessages(messages) {
  return adaptMessagesToProtocol(messages, 'openai').messages;
}

export {
  adaptMessagesToProtocol, loadActiveGameCard, loadCardResources, prepareAfterResponseMessages,
  prepareAfterStreamMessages, prepareInitMessages, preparePreSendMessages, prepareState, toApiMessages
};
