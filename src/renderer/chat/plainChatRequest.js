import { sendChatRequest } from './apiClient.js';

// Preserve ordinary chat's inline thinking convention at the transport boundary.
// Game cards still receive the unmodified model response.
async function sendPlainChatRequest(config, callbacks) {
  let buffer = '', thinking = false, finished = false;
  function flush(final = false) {
    while (buffer) {
      if (finished) { callbacks.onToken(buffer); buffer = ''; break; }
      const tag = thinking ? '</thinking>' : '<thinking>';
      const index = buffer.indexOf(tag);
      const emit = text => { if (text) callbacks[thinking ? 'onThinkingToken' : 'onToken'](text); };
      if (index >= 0) {
        emit(buffer.slice(0, index)); buffer = buffer.slice(index + tag.length);
        if (thinking) finished = true;
        thinking = !thinking;
      } else {
        let keep = 0;
        if (!final) for (let n = 1; n < tag.length; n += 1) if (buffer.endsWith(tag.slice(0, n))) keep = n;
        emit(buffer.slice(0, buffer.length - keep));
        buffer = keep ? buffer.slice(-keep) : '';
        break;
      }
    }
  }
  await sendChatRequest(config, { ...callbacks, onToken(text) { buffer += text; flush(); } });
  flush(true);
}

export { sendPlainChatRequest };
