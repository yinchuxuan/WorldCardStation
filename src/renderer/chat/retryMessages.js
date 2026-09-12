import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';

function findLastUserIndex(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index;
  }
  return -1;
}

function retryUserContent(messages, retryBaseMessages) {
  const current = messages[findLastUserIndex(messages)];
  const original = retryBaseMessages?.[findLastUserIndex(retryBaseMessages)];
  const sameMessage = current && original && (!current.id || !original.id || current.id === original.id);
  return (sameMessage ? original.content : current?.content) || '';
}

function buildRetryMessages(messages, retryBaseMessages, editedContent) {
  const visibleLastUser = findLastUserIndex(messages);
  if (visibleLastUser < 0) return null;
  const retryMessages = cloneJson(retryBaseMessages ?? messages.slice(0, visibleLastUser + 1));
  const retryLastUser = findLastUserIndex(retryMessages);
  if (retryLastUser < 0) return null;
  if (editedContent !== undefined) {
    const content = String(editedContent || '');
    if (!content.trim()) return null;
    retryMessages[retryLastUser] = { ...retryMessages[retryLastUser], content };
  }
  return retryMessages;
}

export { buildRetryMessages, findLastUserIndex, retryUserContent };
