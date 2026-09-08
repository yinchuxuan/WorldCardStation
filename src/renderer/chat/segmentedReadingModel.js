import { applyAssistantDisplayRules } from '../gameCard/displayRules.js';
import { messageKey } from './messageSelection.js';
import { messageDepths } from '../gameCard/messageDepth.js';

const INPUT_ACTION_PATTERN = /data-gc-chat-input-(?:value|value-from|label)/;
const STATE_PATCH_PATTERN = /<state_patch>([\s\S]*?)<\/state_patch>/g;

function splitReadingSegments(content, separator) {
  const normalized = String(content || '').replace(/\r\n?/g, '\n');
  const normalizedSeparator = typeof separator === 'string'
    ? separator.replace(/\r\n?/g, '\n')
    : '';
  const segments = normalizedSeparator
    ? normalized.split(normalizedSeparator)
    : normalized.split(/\n[ \t]*\n+/);
  return segments.filter(segment => segment.trim());
}

function resolveReadingSegments(content, display, includeInputActions = true, depth) {
  const segments = splitReadingSegments(
    applyAssistantDisplayRules(content, display, depth),
    display?.segmentSeparator
  );
  return includeInputActions
    ? segments
    : segments.filter(segment => !INPUT_ACTION_PATTERN.test(segment));
}

function buildStatePatchTimeline(content, display, includeInputActions = true, depth) {
  const source = String(content || '');
  const patches = [...source.matchAll(STATE_PATCH_PATTERN)].map((match, ordinal) => {
    const prefix = source.slice(0, match.index).replace(STATE_PATCH_PATTERN, '');
    return {
      boundary: resolveReadingSegments(prefix, display, includeInputActions, depth).length,
      ordinal,
      text: match[1].trim()
    };
  });
  return {
    pageCount: resolveReadingSegments(source, display, includeInputActions, depth).length,
    patches
  };
}

function buildReadingEntries(messages, isLoading, streamContent, displayedCount, display,
  rawStreamContent = streamContent, streamMessageId = '') {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const depths = messageDepths(sourceMessages, isLoading);
  const completed = sourceMessages
    .map((message, index) => ({ message, messageIndex: index }))
    .filter(({ message, messageIndex }) => message?.role === 'assistant' && depths[messageIndex] !== undefined);
  const lastCompleted = completed.length - 1;
  const entries = completed
    .map(({ message, messageIndex }, index) => {
      const content = String(message.content || '');
      const timeline = buildStatePatchTimeline(
        content,
        display,
        !isLoading && index === lastCompleted,
        depths[messageIndex]
      );
      return {
        content,
        key: messageKey(message, `assistant-${messageIndex}`),
        messageIndex,
        pageCount: timeline.pageCount,
        patches: timeline.patches,
        streaming: false
      };
    })
    .filter(entry => entry.pageCount > 0);
  if (isLoading) {
    const visible = String(streamContent || '').slice(0, displayedCount);
    const content = String(rawStreamContent || visible);
    const timeline = buildStatePatchTimeline(content, display, true, 0);
    entries.push({
      content,
      key: streamMessageId || `streaming-${sourceMessages.length}`,
      messageIndex: sourceMessages.length,
      pageCount: Math.max(resolveReadingSegments(visible, display, true, 0).length, 1),
      patches: timeline.patches,
      streaming: true
    });
  }
  return entries;
}

function normalizeReadingCursor(cursor, entries) {
  if (entries.length === 0) return { entryIndex: 0, pageIndex: 0 };
  const entryIndex = Math.min(cursor.entryIndex, entries.length - 1);
  const pageIndex = Math.min(cursor.pageIndex, entries[entryIndex].pageCount - 1);
  return { entryIndex, pageIndex };
}

function restoreReadingCursor(entries, position) {
  const fallback = { entryIndex: Math.max(entries.length - 1, 0), pageIndex: 0 };
  const messageId = String(position?.messageId || '');
  if (!messageId) return fallback;
  const entryIndex = entries.findIndex(entry => (
    !entry.streaming && String(entry.key) === messageId
  ));
  if (entryIndex < 0) return fallback;
  const pageIndex = Number.isInteger(position?.segmentIndex) ? position.segmentIndex : 0;
  return normalizeReadingCursor({ entryIndex, pageIndex: Math.max(pageIndex, 0) }, entries);
}

export {
  buildStatePatchTimeline,
  buildReadingEntries,
  normalizeReadingCursor,
  restoreReadingCursor,
  resolveReadingSegments,
  splitReadingSegments
};
