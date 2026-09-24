import { cloneJson, deepFreeze } from '../utils/jsonValue.js';
import { decayTTL } from '../engine/ttl.js';
import { mergeRuntimeStateSchema } from '../schema/runtimeStateSchema.js';
import { createSharedState } from './sharedState.js';
import { createResponseStream } from './responseStream.js';
import { runAgentRules } from './agentRules.js';
import { completeResponse } from './completeResponse.js';

// Host-only API. No main.js, display, storage or platform dependency.
function createAgentRuntime({ definition, generate, dependencies = {}, snapshot, idPrefix = '', onUpdate = () => {} }) {
  const card = mergeRuntimeStateSchema({ ...definition.card,
    state: { ...definition.card.state, schema: definition.stateSchema } });
  const store = createSharedState(card.state.schema, card.state.initial || {});
  const contexts = Object.fromEntries(Object.keys(definition.agents).map(id => [id, { messages: [], initialized: false }]));
  let sequence = 0;
  let active;
  let stopped = false;
  let ruleWork;
  const view = () => cloneJson({ state: store.snapshot(), contexts });
  const publish = detail => { if (!stopped) onUpdate(view(), detail); };
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
  async function initialize() {
    if (stopped || active) throw new Error('Agent runtime is not idle');
    const baseline = view();
    const token = { controller: new AbortController() };
    active = token;
    const check = () => {
      if (stopped || token.controller.signal.aborted) throw new Error('Agent initialization cancelled');
    };
    const execute = async () => {
      for (const [agentId, context] of Object.entries(contexts)) {
        if (context.initialized) continue;
        check();
        const agent = definition.agents[agentId];
        const observer = (type, detail, items, state) => dependencies.observer?.(type,
          { agentId, phase: 'init', sourceFile: agent.file, ...detail }, items, state);
        await (ruleWork = runAgentRules({ card: { ...card, rules: agent.definition.rules },
          agentId, phase: 'init', context, store, dependencies, messages, nextId, check, observer
        }).then(effects => publish({ type: 'rules', effects })));
        check();
        context.initialized = true;
      }
      publish({ type: 'initialized' });
    };
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new Error('Agent initialization cancelled'));
      token.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      await Promise.race([execute(), aborted]);
    } catch (error) {
      store.replace(baseline.state);
      Object.assign(contexts, baseline.contexts);
      throw error;
    } finally {
      token.controller.signal.removeEventListener('abort', onAbort);
      if (active === token) active = undefined;
    }
  }
  function call(agentId) {
    const context = requireContext(agentId);
    if (stopped) throw new Error('Agent runtime stopped');
    if (active) throw new Error('another Agent call is still running');
    if (!context.initialized) throw new Error('Agent must be initialized before calling');
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
    const observe = (type, detail = {}, items = context.messages, state = store.snapshot()) => dependencies.observer?.(type,
      { agentId, callId: messageId, sourceFile: definition.agents[agentId].file, ...detail }, items, state);
    const phase = name => (ruleWork = runAgentRules({
      card: { ...card, rules: agent.rules }, agentId, phase: name, context, store, dependencies,
      messages, nextId, check, observer: (type, detail, items, state) => observe(type, { phase: name, ...detail }, items, state)
    }).then(effects => publish({ type: 'rules', effects })));
    async function execute() {
      check();
      observe('agent.start');
      context.messages = decayTTL(context.messages).messages;
      await phase('pre_send');
      check();
      let content = '';
      let thinking = '';
      observe('model.request', { normalized_messages: messages(agentId).map(({ role, content }) => ({ role, content })) });
      await generate({ agentId, model: agent.model, messages: messages(agentId), signal: controller.signal }, {
        onToken(text) { check(); stream.push(text); content += text; },
        onThinkingToken(text) { check(); thinking += text; }
      });
      check();
      stream.finish();
      observe('model.response', { content, thinking });
      const warnings = completeResponse(content, agent.responseValidation, store, observe);
      publish({ type: 'model-patch' });
      context.messages.push({ id: messageId, role: 'assistant', content,
        ...(thinking ? { thinking } : {}), ...(warnings.length ? { _meta: { validationWarnings: warnings } } : {}) });
      publish({ type: 'agent-response', agentId, messageId, warnings });
      await phase('post_response');
      publish({ type: 'agent' });
      observe('agent.end', { status: 'completed' });
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
      observe('agent.end', { status: 'failed', error: error.message });
      throw new Error(`Agent ${agentId}: ${error.message}`, { cause: error });
    }).finally(() => {
      controller.signal.removeEventListener('abort', onAbort);
      if (active === token) active = undefined;
    });
    done.catch(() => {}); // Consumers may await response before done(); never emit an unhandled rejection.
    return Object.freeze({ messageId, response: stream.response, done: () => done });
  }
  return Object.freeze({
    initialize,
    view,
    async applyReadingPatch(text) {
      // Rules run on an async pipeline snapshot. Do not overwrite a concurrent reading commit.
      let waiting;
      do { waiting = ruleWork; await waiting; } while (waiting !== ruleWork);
      if (stopped) throw new Error('Agent runtime stopped');
      const result = store.patch(text);
      store.replace(result.state);
      publish({ type: 'reading-patch', updates: result.updates });
    },
    snapshot() {
      if (active) throw new Error('cannot snapshot an unfinished Agent call');
      return cloneJson({ state: store.snapshot(), contexts });
    },
    agents: Object.freeze({ call, messages }),
    state: Object.freeze(Object.fromEntries(Object.entries(store.api).map(([name, operation]) => [name, (...args) => {
      if (stopped) throw new Error('Agent runtime stopped');
      if (active && ['set', 'delete'].includes(name)) throw new Error('cannot write State during an Agent call');
      const result = operation(...args);
      if (['set', 'delete'].includes(name)) publish({ type: 'state' });
      return result;
    }]))),
    cancel: () => active?.controller.abort(),
    stop() { stopped = true; active?.controller.abort(); }
  });
}

export { createAgentRuntime };
