import { runExecAction } from './execRunner.js';
import { loadCachedRuntimeCard, loadCachedUiScriptResources, readCachedCardText } from './gameCardRuntimeCache.js';
import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';

const SCRIPT_PATH_PATTERN = /^(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$)).+\.js$/i;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function fail(reason, state, extra = {}) {
  return {
    applied: false,
    state: cloneJson(state || {}),
    trace: { type: 'game.script.run', applied: false, reason, changedKeys: [], ...extra }
  };
}

function normalizeScriptPath(filePath) {
  if (typeof filePath !== 'string' || !SCRIPT_PATH_PATTERN.test(filePath)) return '';
  return filePath.split('/').filter((part) => part && part !== '.').join('/');
}

function resolveScriptSourceFile(event, card) {
  if (typeof event?.sourceFile === 'string') return event.sourceFile;
  const script = event?.name && (card?.ui?.scripts?.[event.name] || card?.scripts?.[event.name]);
  if (typeof script === 'string') return script;
  if (isObject(script) && typeof script.sourceFile === 'string') return script.sourceFile;
  return '';
}

function normalizeUiScriptRunEvent(event, card = null) {
  if (event?.type !== 'game.script.run') return { ok: false, reason: 'unsupported_event' };
  const sourceFile = normalizeScriptPath(resolveScriptSourceFile(event, card));
  if (!sourceFile) return { ok: false, reason: 'invalid_source_file' };
  return {
    ok: true,
    sourceFile,
    payload: cloneJson(event.payload || {}),
    name: typeof event.name === 'string' ? event.name : ''
  };
}

async function applyUiScriptRunEvent({ event, state = {}, messages = [], card = null, platform = null, observer } = {}) {
  if (event?.type !== 'game.script.run') return fail('unsupported_event', state);

  let runtimeCard;
  try {
    runtimeCard = await loadCachedRuntimeCard(card, platform?.resources);
  } catch (error) {
    return fail('load_card_failed', state, { error: error.message });
  }
  const normalized = normalizeUiScriptRunEvent(event, runtimeCard);
  if (!normalized.ok) return fail(normalized.reason, state);

  try {
    const loaded = await loadCachedUiScriptResources(card, platform?.resources, normalized.sourceFile);
    const result = await runExecAction(messages, state, { type: 'exec', sourceFile: normalized.sourceFile }, {
      card: loaded.card,
      observer,
      event: { type: 'game.script.run', name: normalized.name, sourceFile: normalized.sourceFile, payload: normalized.payload },
      fileContents: loaded.fileContents,
      readText: filePath => readCachedCardText(loaded.card, platform?.resources, filePath),
      scriptExecutor: platform?.scriptExecutor
    });
    if (JSON.stringify(result.messages) !== JSON.stringify(messages)) return fail('messages_not_supported', state);
    const changedKeys = result.trace?.summary?.state?.changedKeys || [];
    return {
      applied: result.trace?.applied || changedKeys.length > 0,
      state: result.state,
      card: loaded.card,
      trace: { type: 'game.script.run', applied: true, sourceFile: normalized.sourceFile, changedKeys, exec: result.trace }
    };
  } catch (error) {
    return fail('script_failed', state, { error: error.message });
  }
}

export { applyUiScriptRunEvent, normalizeUiScriptRunEvent };
