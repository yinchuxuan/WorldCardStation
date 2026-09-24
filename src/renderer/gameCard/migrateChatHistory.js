import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';
import { validateRuntimeSession } from '../../shared/game-card/runtime/sessionSnapshot.js';
import { defaultChatCard } from './defaultChatCard.js';

// Read-only conversion. The original archive is replaced only by the normal save policy.
function migrateChatHistory(history) {
  if (history.runtimeSession !== undefined) return history;
  function snapshot(messages = [], state = {}) {
    const contexts = { chat: { initialized: true, messages: [] } }, records = [], visible = [];
    messages.forEach((msg, index) => {
      const base = { ...cloneJson(msg), id: `msg-round-0-${index}` };
      if (base._thinking && !base.thinking) base.thinking = base._thinking;
      contexts.chat.messages.push(base);
      if (msg.role === 'user') visible.push({ ...base, id: `user-round-0-${index}` });
      if (msg.role === 'assistant') {
        const record = { ...base, id: `visible-round-0-${index}`, mode: 'continuous',
          units: [{ text: msg.content, patches: [] }] };
        records.push(record); visible.push(record);
      }
    });
    return { state: cloneJson(state), contexts, records, messages: visible };
  }
  const current = snapshot(history.messages, history.gameState);
  const retryMessages = history.retryBaseMessages ?? history.messages ?? [];
  const lastUser = retryMessages.findLastIndex(msg => msg.role === 'user');
  const runtimeSession = validateRuntimeSession({ version: 1, cardId: defaultChatCard.id,
    cardVersion: defaultChatCard.version, sequence: 0, started: true, current, viewState: {},
    retryBase: lastUser < 0 ? null : { input: retryMessages[lastUser].content,
      snapshot: snapshot(retryMessages.slice(0, lastUser), history.retryBaseState ?? history.gameState), viewState: {} }
  });
  return { ...history, runtimeSession };
}

export { migrateChatHistory };
