// Independent fixture for the built-in chat's persisted runtime contract.
function chatSnapshot(messages, state = {}) {
  const context = messages.map((message, index) => ({ ...message, id: `msg-round-0-${index}` }));
  const records = [], visible = [];
  context.forEach((message, index) => {
    if (message.role === 'user') visible.push({ ...message, id: `user-round-0-${index}` });
    if (message.role === 'assistant') {
      const record = { ...message, id: `visible-round-0-${index}`, mode: 'continuous',
        units: [{ text: message.content, patches: [] }] };
      records.push(record); visible.push(record);
    }
  });
  return { version: 1, cardId: 'default-chat', cardVersion: '1', started: true, sequence: 0,
    current: { state, contexts: { chat: { initialized: true, messages: context } }, records, messages: visible },
    viewState: {}, retryBase: null };
}

module.exports = { chatSnapshot };
