import { assertJson, createSharedState } from './sharedState.js';
import { cloneJson } from '../utils/jsonValue.js';
import { mergeRuntimeStateSchema } from '../schema/runtimeStateSchema.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
function requireValue(condition, path) {
  if (!condition) throw new Error(`游戏 Session 已损坏或不兼容：${path}；不能恢复或覆盖`);
}
function message(value, ids, path) {
  requireValue(object(value) && typeof value.id === 'string' && value.id.length > 0
    && !ids.has(value.id) && ['system', 'user', 'assistant'].includes(value.role)
    && typeof value.content === 'string', path);
  ids.add(value.id);
  requireValue(value.thinking === undefined || typeof value.thinking === 'string', `${path}.thinking`);
  requireValue(value.ttl === undefined || Number.isInteger(value.ttl) && value.ttl >= -1, `${path}.ttl`);
  requireValue(value._meta === undefined || object(value._meta), `${path}._meta`);
}
function validateView(view, snapshot) {
  requireValue(object(view), 'viewState');
  if (view.reading !== undefined && view.reading !== null) {
    const record = snapshot.records.find(item => item.id === view.reading.messageId);
    const count = record?.mode === 'segmented' ? record.units.filter(unit => unit.text.trim()).length : 1;
    requireValue(record && Number.isInteger(view.reading.segmentIndex)
      && view.reading.segmentIndex >= 0 && view.reading.segmentIndex < count, 'viewState.reading');
  }
  if (view.presentation !== undefined) {
    requireValue(object(view.presentation), 'viewState.presentation');
    for (const [key, value] of Object.entries(view.presentation)) {
      requireValue(['background', 'portrait', 'bgm'].includes(key) && (value === null || object(value)), `presentation.${key}`);
    }
  }
}
function validateSnapshot(snapshot, definition) {
  requireValue(object(snapshot) && object(snapshot.state) && object(snapshot.contexts)
    && Array.isArray(snapshot.records) && Array.isArray(snapshot.messages), 'snapshot');
  const ids = new Set();
  for (const [id, context] of Object.entries(snapshot.contexts)) {
    requireValue(object(context) && typeof context.initialized === 'boolean'
      && Array.isArray(context.messages), `contexts.${id}`);
    context.messages.forEach(msg => message(msg, ids, `contexts.${id}.messages`));
    requireValue(context.initialized || context.messages.length === 0, `contexts.${id}.initialized`);
  }
  const records = new Map();
  snapshot.records.forEach(record => {
    message(record, ids, 'records');
    requireValue(record.role === 'assistant' && ['segmented', 'continuous'].includes(record.mode)
      && Array.isArray(record.units), 'records.mode/units');
    record.units.forEach(unit => requireValue(object(unit) && typeof unit.text === 'string'
      && Array.isArray(unit.patches) && unit.patches.every(text => typeof text === 'string'), 'records.units'));
    const text = record.units.map(unit => unit.text).filter(text => text.length).join(record.mode === 'segmented' ? '\n\n' : '');
    requireValue(record.content === text, 'records.content');
    records.set(record.id, record);
  });
  const visibleIds = new Set();
  snapshot.messages.forEach(msg => {
    message(msg, visibleIds, 'messages');
    requireValue(msg.role === 'user' || JSON.stringify(msg) === JSON.stringify(records.get(msg.id)), 'messages.record');
    if (msg.role === 'user') requireValue(!ids.has(msg.id), 'messages.id');
  });
  requireValue(snapshot.records.every(record => !record.content || visibleIds.has(record.id)), 'messages.missingRecord');
  if (definition) {
    requireValue(JSON.stringify(Object.keys(snapshot.contexts).sort()) === JSON.stringify(Object.keys(definition.agents).sort()), 'agents');
    const card = mergeRuntimeStateSchema({ ...definition.card, state: { schema: definition.stateSchema } });
    const store = createSharedState(card.state.schema);
    requireValue(JSON.stringify(store.validate(snapshot.state)) === JSON.stringify(snapshot.state), 'state');
  }
}

// Data only: never invoke init, rules, reader or model while validating a saved Session.
export function validateRuntimeSession(value, definition) {
  assertJson(value);
  requireValue(object(value) && value.version === 1 && typeof value.cardId === 'string'
    && typeof value.cardVersion === 'string' && Number.isSafeInteger(value.sequence) && value.sequence >= 0, 'version/card/sequence');
  if (definition) requireValue(value.cardId === definition.card.id && value.cardVersion === definition.card.version, 'card identity');
  validateSnapshot(value.current, definition);
  validateView(value.viewState, value.current);
  if (value.retryBase !== null) {
    requireValue(object(value.retryBase) && typeof value.retryBase.input === 'string', 'retryBase');
    validateSnapshot(value.retryBase.snapshot, definition);
    validateView(value.retryBase.viewState, value.retryBase.snapshot);
  }
  const snapshots = [value.current, value.retryBase?.snapshot].filter(Boolean);
  for (const snapshot of snapshots) {
    const messages = [...snapshot.messages, ...snapshot.records, ...Object.values(snapshot.contexts).flatMap(ctx => ctx.messages)];
    messages.forEach(msg => {
      const round = /^(?:msg|visible|user)-round-(\d+)-/.exec(msg.id);
      requireValue(round && Number(round[1]) <= value.sequence, 'sequence/message id');
    });
  }
  return cloneJson(value);
}

export function runtimeHistory(value) {
  return { messages: value.current.messages, gameState: value.current.state,
    viewState: value.viewState, runtimeSession: value };
}
