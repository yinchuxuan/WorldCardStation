import { applyActions } from './actions.js';
import { applyActionsAsync } from './asyncActions.js';
import { withFindState } from './findResolver.js';
import { matchesWhen } from './predicate.js';
import { validateGameCard } from '../schema/validateGameCard.js';
import { conditionObserver, observeNode, record } from '../trace/nodes.js';

function cloneMessages(messages) {
  return Array.isArray(messages) ? messages.map(message => ({
    ...message, ...(message?._meta ? { _meta: { ...message._meta } } : {})
  })) : [];
}

function ruleResult(messages, state, applied, found, rule, index) {
  const finalState = found ? found.restore(applied.state) : applied.state;
  const count = key => applied.trace.reduce((total, action) => total + (action.summary?.messages?.[key] || 0), 0);
  const keys = new Set([...Object.keys(state), ...Object.keys(finalState)]);
  return {
    messages: applied.messages, state: finalState,
    trace: {
      ruleIndex: index, ruleId: rule.id, matched: true, actions: applied.trace,
      summary: {
        messages: { before: messages.length, after: applied.messages.length,
          inserted: count('inserted'), removed: count('removed'), replaced: count('replaced') },
        state: { changedKeys: [...keys].filter(key => state[key] !== finalState[key]) }
      }
    }
  };
}

function applyMatchingRule(current, rule, index, options, actions) {
  const { messages, state } = current;
  return observeNode('rule', messages, state, options, { ruleIndex: index, ruleId: rule.id }, () => {
    const found = rule.find ? withFindState(state, rule.find, messages, options) : null;
    const applied = actions(messages, rule.then || [], {
      ...options, pointer: `${options.pointer}/then`, state: found?.state || state
    });
    const finish = result => ruleResult(messages, state, result, found, rule, index);
    return applied?.then ? applied.then(finish) : finish(applied);
  });
}

function applyRule(current, rule, index, options, actions) {
  let stage = 'when';
  const scoped = { ...options, pointer: `/rules/${index}` };
  const fail = error => {
    record(scoped, 'rule.rollback', { ruleIndex: index, ruleId: rule.id, stage,
      status: 'rolled_back', error: { code: 'RULE_ERROR', message: error.message } }, current.messages, current.state);
    return { ...current, trace: { ...current.trace,
      errors: [...current.trace.errors, `rule[${index}] ${stage}: ${error.message}`] } };
  };
  const finish = applied => ({ messages: applied.messages, state: applied.state,
    trace: { ...current.trace, rules: [...current.trace.rules, applied.trace] } });
  try {
    if (!matchesWhen(rule.when, options.event.phase, current.messages, current.state, conditionObserver(scoped))) {
      record(scoped, 'rule.skipped', { ruleIndex: index, ruleId: rule.id, status: 'skipped', reason: 'when_not_matched' });
      return current;
    }
    stage = 'then';
    const applied = applyMatchingRule(current, rule, index, scoped, actions);
    return applied?.then ? applied.then(finish, fail) : finish(applied);
  } catch (error) { return fail(error); }
}

function prepare({ card, phase, messages = [], state = {}, event = {}, fileContents, dependencies = {}, observer } = {}) {
  const validation = validateGameCard(card);
  const initial = {
    messages: cloneMessages(messages),
    state: state && typeof state === 'object' && !Array.isArray(state) ? { ...state } : {},
    trace: { phase, rules: [], errors: validation.errors }
  };
  if (!validation.valid) observer?.('schema.error', { errors: validation.errors });
  return { validation, initial, options: {
    card, event: { ...event, phase }, fileContents, observer,
    readFile: dependencies.readFile, readText: dependencies.readText, runExecAction: dependencies.runExecAction
  } };
}

function applyGameCard(input = {}) {
  const { validation, initial, options } = prepare(input);
  if (!validation.valid) return initial;
  return options.card.rules.reduce((current, rule, index) => applyRule(current, rule, index, options, applyActions), initial);
}

async function applyGameCardAsync(input = {}) {
  const { validation, initial, options } = prepare(input);
  if (!validation.valid) return initial;
  return applyRulesAsync(initial, options);
}

// Internal execution for definitions already validated at their loading boundary.
async function applyRulesAsync(initial, options) {
  let result = initial;
  for (const [index, rule] of options.card.rules.entries()) {
    result = await applyRule(result, rule, index, options, applyActionsAsync);
    if (options.strict && result.trace.errors.length) throw new Error(result.trace.errors.join('; '));
  }
  return result;
}

export { applyGameCard, applyGameCardAsync, applyRulesAsync, cloneMessages };
