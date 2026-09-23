import { matchesPredicate } from './predicate.js';
import { deleteStateValue, getStateValue, hasStateValue, setStateValue } from '../state/statePaths.js';
import { conditionObserver, record } from '../trace/nodes.js';

function normalizeFind(find) {
  if (Array.isArray(find)) return find;
  if (find !== undefined) throw new Error('find must be a non-empty array');
  return [];
}

function selectValue(message, select = 'content') {
  if (select === '_meta.source') return message?._meta?.source || '';
  return message?.[select] || '';
}

function applyMatch(value, match) {
  if (!match?.regex) return String(value ?? '');
  const found = String(value ?? '').match(new RegExp(match.regex));
  if (!found) return '';
  const group = match.group === undefined ? (found.length > 1 ? 1 : 0) : Number(match.group);
  return found[group] !== undefined ? found[group] : '';
}

function resolveFindSpec(spec, messages, observer) {
  const matched = messages
    .filter((message, index) => matchesPredicate(spec.from, message, index, messages, observer))
    .map((message) => applyMatch(selectValue(message, spec.select), spec.match));
  const values = matched.filter((value) => value !== '');
  if (spec.many) return values.length > 0 ? values : spec.default ?? [];
  return values.length > 0 ? values[0] : spec.default ?? null;
}

function resolveFind(find, messages = [], options = {}) {
  return normalizeFind(find).reduce((result, spec, index) => {
    const source = spec.agentId === undefined || spec.agentId === options.agentId
      ? messages : options.agentMessages?.(spec.agentId);
    if (!source) throw new Error(`unknown Agent: ${spec.agentId}`);
    if (spec?.name) result[spec.name] = resolveFindSpec(spec, source, conditionObserver(options, `find/${index}/from`));
    return result;
  }, {});
}

function restoreTempFind(state, previous) {
  if (previous.exists) return setStateValue(state, 'temp.find', previous.value);
  return deleteStateValue(state, 'temp.find');
}

function withFindState(state = {}, find, messages = [], options = {}) {
  const previous = {
    exists: hasStateValue(state, 'temp.find'),
    value: getStateValue(state, 'temp.find')
  };
  const values = resolveFind(find, messages, options);
  const base = previous.exists && previous.value && typeof previous.value === 'object' && !Array.isArray(previous.value)
    ? previous.value
    : {};
  const foundState = setStateValue(state, 'temp.find', { ...base, ...values });
  record(options, 'find.enter', { values, previous, persistence: 'local' }, messages, foundState);
  return {
    state: foundState,
    restore: (nextState) => {
      const restored = restoreTempFind(nextState, previous);
      record(options, 'find.restore', { persistence: 'local' }, undefined, restored);
      return restored;
    },
    values
  };
}

export { normalizeFind, resolveFind, withFindState };
