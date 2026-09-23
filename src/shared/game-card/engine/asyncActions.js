import { applyAction } from './actions.js';
import { observeNode } from '../trace/nodes.js';

async function applyActionAsync(messages, action, options = {}) {
  return applyAction(messages, action, options, applyActionsAsync);
}

async function applyActionsAsync(messages, actions = [], options = {}) {
  let result = { messages, state: options.state || {}, trace: [] };
  for (const [index, action] of actions.entries()) {
    const scoped = { ...options, pointer: `${options.pointer || ''}/${index}`, state: result.state };
    options.beforeAction?.(action);
    const next = await observeNode('action', result.messages, result.state, scoped,
      { actionType: action.type || 'group', action }, () => applyActionAsync(result.messages, action, scoped));
    options.finalizeAction?.(next, result.messages, action);
    result = { messages: next.messages, state: next.state || result.state, trace: [...result.trace, next.trace] };
  }
  return result;
}

export { applyActionAsync, applyActionsAsync };
