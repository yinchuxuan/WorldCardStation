import { loadCachedRuntimeCard } from './gameCardRuntimeCache.js';
import { applyStatePatch } from '../../shared/game-card/state/statePatch.js';

const PRESENTATION_PATHS = [
  'visual.scene',
  'visual.portraits',
  'audio.bgm'
];

async function prepareStatePatchAtCursor({
  patchText,
  messages = [],
  state = {},
  card,
  platform,
  observer
} = {}) {
  if (!card || !patchText) {
    return { state, applied: false, trace: null, card: card || null };
  }

  let runtimeCard;
  try {
    runtimeCard = await loadCachedRuntimeCard(card, platform?.resources);
  } catch (error) {
    return { state, applied: false, trace: null, card: null, error: error.message };
  }

  const patched = applyStatePatch(patchText, state, {
    messages,
    observer,
    schema: runtimeCard?.state?.schema
  });
  if (!patched.trace.applied) {
    return {
      state,
      applied: false,
      trace: patched.trace,
      card: runtimeCard
    };
  }

  return {
    state: patched.state,
    applied: true,
    trace: patched.trace,
    patchTrace: patched.trace,
    presentationEffects: [],
    presentationChangedKeys: PRESENTATION_PATHS.filter(path => (
      patched.trace.changedKeys.includes(path)
    )),
    card: runtimeCard
  };
}

export { prepareStatePatchAtCursor };
