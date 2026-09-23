import { cloneJson } from '../utils/jsonValue.js';
import { getStateValue, hasStateValue } from '../state/statePaths.js';
import { ensureStateDefaults, normalizeStateSchema, validateStatePathValue } from '../state/stateSchema.js';
import { applyStateAction } from '../state/stateActions.js';
import { applyStatePatch } from '../state/statePatch.js';

function assertJson(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || !value) throw new Error('State requires JSON values');
  if ((!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') || ancestors.has(value)) {
    throw new Error('State requires acyclic JSON values');
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`unsafe State key: ${key}`);
    assertJson(child, ancestors);
  }
  ancestors.delete(value);
}

function assertPath(path) {
  if (typeof path !== 'string' || path.split('.').some(part => (
    !part || part.includes('[') || part.includes(']') || ['__proto__', 'constructor', 'prototype'].includes(part)
  ))) throw new Error(`invalid State path: ${path}`);
}

function createSharedState(schemaInput = {}, initial = {}) {
  const { schema, errors } = normalizeStateSchema(schemaInput);
  if (errors.length) throw new Error(errors.join('; '));
  Object.keys(schema).forEach(assertPath);
  assertJson(schema);
  assertJson(initial);
  const prepared = ensureStateDefaults(schema, initial);
  if (prepared.errors.length) throw new Error(prepared.errors.join('; '));
  let current = prepared.state;
  function validate(value) {
    assertJson(value);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('State must be an object');
    let next = cloneJson(value);
    for (const path of Object.keys(schema)) {
      if (!hasStateValue(next, path)) continue;
      const result = validateStatePathValue(schema, path, getStateValue(next, path));
      if (result.error) throw new Error(`state.${path}: ${result.error}`);
      if (result.changed) next = applyStateAction(next, { type: 'state.set', path, value: result.value }).state;
    }
    return next;
  }
  function apply(action) {
    assertPath(action.path);
    if (Object.hasOwn(action, 'value')) assertJson(action.value);
    const result = applyStateAction(current, action, { schema });
    if (!result.trace.applied) throw new Error(`state.${action.path}: ${result.trace.reason}`);
    current = validate(result.state);
  }
  function patch(text, base = current) {
    const result = applyStatePatch(text, base, { schema, actionFilter: action => {
      assertPath(action?.path);
      if (Object.hasOwn(action, 'value')) assertJson(action.value);
      const ancestors = Object.keys(schema).filter(path => action.path === path || action.path.startsWith(`${path}.`));
      const denied = Object.keys(schema).some(path => schema[path].llmWrite === false && (
        path === action.path || path.startsWith(`${action.path}.`) || action.path.startsWith(`${path}.`)
      ));
      if (!ancestors.length || denied) throw new Error(`LLM cannot write state.${action.path}`);
      return true;
    } });
    if (result.trace.reason || result.trace.actions.some(action => !action.applied)) {
      throw new Error(`invalid state_patch: ${result.trace.reason || result.trace.actions.find(a => !a.applied).reason}`);
    }
    return { state: validate(result.state), updates: result.trace.updates };
  }
  return {
    snapshot: () => cloneJson(current),
    replace: value => { current = validate(value); },
    validate, patch,
    api: Object.freeze({
      get: path => { assertPath(path); return cloneJson(getStateValue(current, path)); },
      has: path => { assertPath(path); return hasStateValue(current, path); },
      set: (path, value) => apply({ type: 'state.set', path, value }),
      delete: path => apply({ type: 'state.delete', path })
    })
  };
}

export { createSharedState, assertPath, assertJson };
