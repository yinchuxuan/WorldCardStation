function isDialogue(message) {
  return ['user', 'assistant'].includes(message?.role)
    && !['llm_only', 'debug_only'].includes(message._meta?.visibility)
    && !message._meta?.worldbook_scope;
}

function messageDepths(messages, streaming = false) {
  let depth = streaming ? 1 : 0;
  const result = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    result[index] = isDialogue(messages[index]) ? depth++ : undefined;
  }
  return result;
}

export { messageDepths };
