import { applyActions } from './actions.js';
import { applyActionsAsync } from './asyncActions.js';
import { withFindState } from './findResolver.js';
import { matchesWhen } from './predicate.js';
import { validateGameCard } from '../schema/validateGameCard.js';

function cloneMessage(message) {
  return {
    ...message,
    ...(message?._meta ? { _meta: { ...message._meta } } : {})
  };
}

function cloneMessages(messages) {
  return Array.isArray(messages) ? messages.map(cloneMessage) : [];
}

function cloneState(state) {
  return state && typeof state === 'object' && !Array.isArray(state) ? { ...state } : {};
}

function summarizeActionMessages(actions, before, after) {
  return {
    before: before.length,
    after: after.length,
    inserted: sumActionCount(actions, 'inserted'),
    removed: sumActionCount(actions, 'removed'),
    replaced: sumActionCount(actions, 'replaced')
  };
}

function sumActionCount(actions, key) {
  return actions.reduce((total, action) => total + (action.summary?.messages?.[key] || 0), 0);
}

function summarizeState(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return {
    changedKeys: [...keys].filter((key) => before[key] !== after[key])
  };
}

function applyMatchingRule(messages, state, rule, index, options) {
  const found = rule.find ? withFindState(state, rule.find, messages) : null;
  const applied = applyActions(messages, rule.then || [], {
    ...options,
    state: found?.state || state,
    find: found && !Array.isArray(rule.find) ? { ...options.find, ...rule.find } : options.find
  });
  const finalState = found ? found.restore(applied.state) : applied.state;
  return {
    messages: applied.messages,
    state: finalState,
    trace: {
      ruleIndex: index,
      ruleId: rule.id,
      matched: true,
      actions: applied.trace,
      summary: {
        messages: summarizeActionMessages(applied.trace, messages, applied.messages),
        state: summarizeState(state, finalState)
      }
    }
  };
}

async function applyMatchingRuleAsync(messages, state, rule, index, options) {
  const found = rule.find ? withFindState(state, rule.find, messages) : null;
  const applied = await applyActionsAsync(messages, rule.then || [], {
    ...options,
    state: found?.state || state,
    find: found && !Array.isArray(rule.find) ? { ...options.find, ...rule.find } : options.find
  });
  const finalState = found ? found.restore(applied.state) : applied.state;
  return {
    messages: applied.messages,
    state: finalState,
    trace: {
      ruleIndex: index, ruleId: rule.id, matched: true, actions: applied.trace,
      summary: {
        messages: summarizeActionMessages(applied.trace, messages, applied.messages),
        state: summarizeState(state, finalState)
      }
    }
  };
}

function formatRuleError(index, stage, error) {
  return `rule[${index}] ${stage}: ${error.message}`;
}

function applyGameCard({ card, phase, messages = [], state = {}, event = {}, fileContents, dependencies = {} } = {}) {
  const validation = validateGameCard(card);
  const initialMessages = cloneMessages(messages);
  const initialState = cloneState(state);
  const trace = {
    phase,
    rules: [],
    errors: validation.errors
  };

  if (!validation.valid) {
    return { messages: initialMessages, state: initialState, trace };
  }

  const result = card.rules.reduce((current, rule, index) => {
    try {
      if (!matchesWhen(rule.when, phase, current.messages, current.state)) return current;
    } catch (error) {
      return {
        ...current,
        trace: {
          ...current.trace,
          errors: [...current.trace.errors, formatRuleError(index, 'when', error)]
        }
      };
    }

    let applied;
    try {
      applied = applyMatchingRule(current.messages, current.state, rule, index, {
        card,
        event: { ...event, phase },
        fileContents,
        readFile: dependencies.readFile,
        readText: dependencies.readText,
        runExecAction: dependencies.runExecAction
      });
    } catch (error) {
      return {
        ...current,
        trace: {
          ...current.trace,
          errors: [...current.trace.errors, formatRuleError(index, 'then', error)]
        }
      };
    }
    return {
      messages: applied.messages,
      state: applied.state,
      trace: {
        ...current.trace,
        rules: [...current.trace.rules, applied.trace]
      }
    };
  }, { messages: initialMessages, state: initialState, trace });

  return {
    messages: result.messages,
    state: result.state,
    trace: result.trace
  };
}

async function applyGameCardAsync(options = {}) {
  const { card, phase, messages = [], state = {}, event = {}, fileContents, dependencies = {} } = options;
  const validation = validateGameCard(card);
  let result = {
    messages: cloneMessages(messages),
    state: cloneState(state),
    trace: { phase, rules: [], errors: validation.errors }
  };
  if (!validation.valid) return result;

  for (let index = 0; index < card.rules.length; index += 1) {
    const rule = card.rules[index];
    try {
      if (!matchesWhen(rule.when, phase, result.messages, result.state)) continue;
      const applied = await applyMatchingRuleAsync(result.messages, result.state, rule, index, {
        card,
        event: { ...event, phase },
        fileContents,
        readFile: dependencies.readFile,
        readText: dependencies.readText,
        runExecAction: dependencies.runExecAction
      });
      result = {
        messages: applied.messages,
        state: applied.state,
        trace: { ...result.trace, rules: [...result.trace.rules, applied.trace] }
      };
    } catch (error) {
      result = {
        ...result,
        trace: { ...result.trace, errors: [...result.trace.errors, formatRuleError(index, 'then', error)] }
      };
    }
  }
  return result;
}

export { applyGameCard, applyGameCardAsync, cloneMessages };
