import { applyRulesAsync } from '../engine/engine.js';
import { validateMessage } from '../exec/execResult.js';
import { cloneJson } from '../utils/jsonValue.js';
import { assertJson, assertPath } from './sharedState.js';
import { collectPresentationEffects } from '../engine/presentationActions.js';

async function runAgentRules({ card, agentId, phase, context, store, dependencies, messages, nextId, check, observer }) {
  const finalizeAction = (result, previous, action) => {
    check();
    if (result.trace?.reason && result.trace.reason !== 'when_not_matched' && result.trace.applied === false) {
      throw new Error(`action failed: ${result.trace.reason}`);
    }
    if (action.then) return; // Children have already crossed this boundary.
    const allowed = new Set(previous.map(msg => msg.id));
    const seen = new Set();
    result.messages = result.messages.map(message => {
      if (!validateMessage(message)) throw new Error('invalid Agent message');
      if (message.id !== undefined && (!allowed.has(message.id) || seen.has(message.id))) {
        throw new Error('message id cannot be assigned or duplicated by rules');
      }
      const id = message.id ?? nextId();
      seen.add(id);
      return { ...cloneJson(message), id };
    });
    if (result.state !== undefined) result.state = store.validate(result.state);
  };
  const result = await applyRulesAsync({
    messages: cloneJson(context.messages), state: store.snapshot(), trace: { phase, rules: [], errors: [] }
  }, {
    card, agentId, event: { phase, agentId }, strict: true, observer,
    fileContents: dependencies.fileContents,
    readFile: dependencies.readFile, readText: dependencies.readText,
    runExecAction: dependencies.runExecAction,
    agentMessages: messages,
    beforeAction(action) {
      check();
      if (action.type?.startsWith('state.')) {
        assertPath(action.path);
        if (Object.hasOwn(action, 'value')) assertJson(action.value);
      }
    },
    finalizeAction
  });
  check();
  context.messages = result.messages;
  store.replace(result.state);
  return collectPresentationEffects(result.trace);
}

export { runAgentRules };
