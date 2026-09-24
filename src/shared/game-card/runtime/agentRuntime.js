import { cloneJson, deepFreeze } from '../utils/jsonValue.js';
import { decayTTL } from '../engine/ttl.js';
import { mergeRuntimeStateSchema } from '../schema/runtimeStateSchema.js';
import { createSharedState } from './sharedState.js';
import { createResponseStream } from './responseStream.js';
import { runAgentRules } from './agentRules.js';
import { completeResponse } from './completeResponse.js';

// Host-only API. No main.js, display, storage or platform dependency.
function createAgentRuntime({ definition, generate, dependencies = {}, snapshot, idPrefix = '' }) {
  const card = mergeRuntimeStateSchema({ ...definition.card,
    state: { ...definition.card.state, schema: definition.stateSchema } });
  const store = createSharedState(card.state.schema, card.state.initial || {});
  const contexts = Object.fromEntries(Object.keys(definition.agents).map(id => [id, { messages: [], initialized: false }]));
  let sequence = 0;
  let active;
  let stopped = false;
  const nextId = () => `msg-${idPrefix}${++sequence}`;
  if (snapshot) {
    store.replace(snapshot.state);
    for (const id of Object.keys(contexts)) {
      if (!snapshot.contexts?.[id]) throw new Error(`missing Agent snapshot: ${id}`);
      contexts[id] = cloneJson(snapshot.contexts[id]);
    }
  }
  function requireContext(id) {
    if (!Object.hasOwn(contexts, id)) throw new Error(`unknown Agent: ${id}`);
    return contexts[id];
  }
  const messages = id => deepFreeze(cloneJson(requireContext(id).messages));
  function call(agentId) {
    const context = requireContext(agentId);
    if (stopped) throw new Error('Agent runtime stopped');
    if (active) throw new Error('another Agent call is still running');
    const controller = new AbortController();
    const stream = createResponseStream();
    const messageId = nextId();
    const baseline = { context: cloneJson(context), state: store.snapshot() };
    const token = { controller };
    active = token;
    function check() {
      if (controller.signal.aborted || active !== token || stopped) throw new Error('Agent call cancelled');
    }
    const agent = definition.agents[agentId].definition;
    const phase = name => runAgentRules({
      card: { ...card, rules: agent.rules }, agentId, phase: name, context, store, dependencies,
      messages, nextId, check
    });
    async function execute() {
      check();
      if (!context.initialized) {
        await phase('init');
        check();
        context.initialized = true;
      }
      context.messages = decayTTL(context.messages).messages;
      await phase('pre_send');
      check();
      let content = '';
      let thinking = '';
      await generate({ agentId, model: agent.model, messages: messages(agentId), signal: controller.signal }, {
        onToken(text) { check(); stream.push(text); content += text; },
        onThinkingToken(text) { check(); thinking += text; }
      });
      check();
      stream.finish();
      const warnings = completeResponse(content, agent.responseValidation, store);
      context.messages.push({ id: messageId, role: 'assistant', content,
        ...(thinking ? { thinking } : {}), ...(warnings.length ? { _meta: { validationWarnings: warnings } } : {}) });
      await phase('post_response');
    }
    // Abort races even an uncooperative transport/exec; check fences its late results.
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new Error('Agent call cancelled'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const done = Promise.race([Promise.resolve().then(execute), aborted]).catch(error => {
      stream.finish(error);
      context.messages = baseline.context.messages;
      context.initialized = baseline.context.initialized;
      store.replace(baseline.state);
      throw new Error(`Agent ${agentId}: ${error.message}`, { cause: error });
    }).finally(() => {
      controller.signal.removeEventListener('abort', onAbort);
      if (active === token) active = undefined;
    });
    done.catch(() => {}); // Consumers may await response before done(); never emit an unhandled rejection.
    return Object.freeze({ messageId, response: stream.response, done: () => done });
  }
  return Object.freeze({
    snapshot() {
      if (active) throw new Error('cannot snapshot an unfinished Agent call');
      return cloneJson({ state: store.snapshot(), contexts });
    },
    agents: Object.freeze({ call, messages }),
    state: Object.freeze(Object.fromEntries(Object.entries(store.api).map(([name, operation]) => [name, (...args) => {
      if (stopped) throw new Error('Agent runtime stopped');
      if (active && ['set', 'delete'].includes(name)) throw new Error('cannot write State during an Agent call');
      return operation(...args);
    }]))),
    cancel: () => active?.controller.abort(),
    stop() { stopped = true; active?.controller.abort(); }
  });
}

export { createAgentRuntime };
