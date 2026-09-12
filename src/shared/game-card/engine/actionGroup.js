function groupResult(messages, result) {
  const changed = new Set();
  result.trace.forEach(trace => (trace.summary?.state?.changedKeys || []).forEach(key => changed.add(key)));
  const count = key => result.trace.reduce((sum, trace) => sum + (trace.summary?.messages?.[key] || 0), 0);
  return {
    messages: result.messages, state: result.state,
    trace: {
      type: 'group', applied: result.trace.some(item => item.applied), matched: 1, actions: result.trace,
      summary: {
        messages: { before: messages.length, after: result.messages.length,
          inserted: count('inserted'), removed: count('removed'), replaced: count('replaced') },
        state: { changedKeys: [...changed] }
      }
    }
  };
}

export { groupResult };
