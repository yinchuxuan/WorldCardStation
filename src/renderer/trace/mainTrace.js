function beginMainTrace(capture, definition, baseline, input, startup = false) {
  const main = capture?.begin(startup ? 'main.start' : 'main.input', { messages: baseline.messages, state: baseline.state },
    { sourceFile: definition.main.path, input, contexts: baseline.contexts });
  if (!main) return null;
  const calls = new Map();
  return {
    event({ type, detail, messages, state }) {
      const id = detail.callId;
      if (type === 'agent.start') calls.set(id, capture.begin('agent.call', { messages, state }, { ...detail, parentOperationId: main.id }));
      const call = calls.get(id);
      const sources = definition.agents[detail.agentId]?.sources;
      const pointer = detail.pointer || (detail.ruleIndex !== undefined ? `/rules/${detail.ruleIndex}` : undefined);
      const source = pointer ? sources?.[pointer] : undefined;
      (call || main).observe(type, { ...detail, ...(source ? { source } : {}) }, messages, state);
      if (type === 'agent.end') { call?.end({ messages, state }, detail.status); calls.delete(id); }
    },
    update(view, { type: reason, ...detail }) {
      main.observe('main.view', { ...detail, reason, contexts: view.contexts }, view.messages, view.state);
    },
    end(view, status) {
      calls.forEach(call => call?.end(undefined, 'aborted'));
      calls.clear();
      main.end({ messages: view.messages, state: view.state }, status);
    }
  };
}

export { beginMainTrace };
