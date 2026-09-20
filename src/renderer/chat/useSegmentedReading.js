import React from 'react';
import {
  buildReadingEntries,
  normalizeReadingCursor,
  restoreReadingCursor
} from './segmentedReadingModel.js';
import useReadingCheckpoint from './useReadingCheckpoint.js';

const SEGMENT_TRANSITION_MS = 280;
const INTERACTIVE_SELECTOR = [
  'a', 'button', 'input', 'textarea', 'select', 'label',
  '[role="button"]', '[contenteditable="true"]',
  '[data-gc-part="chat-header"]', '.chat-message-editable-bubble',
  '[data-gc-chat-input-value]', '[data-gc-chat-input-value-from]',
  '[data-gc-chat-input-label]'
].join(',');

function isSegmentAdvanceEvent(event) {
  if (!event) return true;
  if (event.defaultPrevented || (event.type === 'click' && event.button !== 0)) return false;
  const interactive = event.target?.closest?.(INTERACTIVE_SELECTOR);
  if (interactive && interactive !== event.currentTarget) return false;
  const view = event.currentTarget?.ownerDocument?.defaultView
    || event.target?.ownerDocument?.defaultView
    || event.currentTarget;
  const selection = view?.getSelection?.();
  return !selection || selection.isCollapsed;
}

function useSegmentedReading({
  enabled,
  isLoading,
  messages = [],
  streamContent = '',
  rawStreamContent = streamContent,
  streamMessageId = '',
  displayedCount = 0,
  display,
  scopeKey,
  surfaceRef,
  onReadProgress,
  restorePosition,
  restoreToken,
  onPositionChange
}) {
  const entries = React.useMemo(() => buildReadingEntries(
    messages, isLoading, streamContent, displayedCount, display, rawStreamContent, streamMessageId
  ), [display, displayedCount, isLoading, messages, rawStreamContent, streamContent, streamMessageId]);
  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;
  const [cursor, setCursor] = React.useState(() => ({
    entryIndex: Math.max(entries.length - 1, 0),
    pageIndex: 0
  }));
  const cursorRef = React.useRef(cursor);
  const restoredTokenRef = React.useRef(null);
  const transitionRef = React.useRef(false);
  const timerRef = React.useRef(null);
  const latestKey = entries[entries.length - 1]?.key || '';
  const latestCompletedKey = [...entries].reverse().find(entry => !entry.streaming)?.key || '';
  const previousRef = React.useRef({
    enabled, isLoading, latestKey, latestCompletedKey, scopeKey
  });

  const commit = React.useCallback((next) => {
    cursorRef.current = next;
    setCursor(next);
  }, []);
  const reset = React.useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    transitionRef.current = false;
    commit({ entryIndex: Math.max(entriesRef.current.length - 1, 0), pageIndex: 0 });
  }, [commit]);

  React.useLayoutEffect(() => {
    const previous = previousRef.current;
    const generationStarted = enabled && isLoading && !previous.isLoading;
    const loadingHistoryChanged = enabled && isLoading && previous.isLoading
      && (latestCompletedKey !== previous.latestCompletedKey || latestKey !== previous.latestKey);
    const idleMessageChanged = enabled && !isLoading && !previous.isLoading
      && latestKey !== previous.latestKey;
    if (enabled !== previous.enabled || scopeKey !== previous.scopeKey
      || generationStarted || loadingHistoryChanged || idleMessageChanged) reset();
    previousRef.current = {
      enabled, isLoading, latestKey, latestCompletedKey, scopeKey
    };
  }, [enabled, isLoading, latestCompletedKey, latestKey, reset, scopeKey]);

  React.useLayoutEffect(() => {
    const next = normalizeReadingCursor(cursorRef.current, entries);
    if (next.entryIndex !== cursorRef.current.entryIndex
      || next.pageIndex !== cursorRef.current.pageIndex) commit(next);
  }, [commit, entries]);

  React.useLayoutEffect(() => {
    if (!enabled || (isLoading && restorePosition?.messageId) || entries.length === 0 || restoredTokenRef.current === restoreToken) return;
    restoredTokenRef.current = restoreToken;
    commit(restoreReadingCursor(entries, restorePosition));
  }, [commit, enabled, entries, isLoading, restorePosition, restoreToken]);

  React.useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  const move = React.useCallback((event, direction) => {
    if (transitionRef.current || !isSegmentAdvanceEvent(event)) return false;
    const currentEntries = entriesRef.current;
    const current = normalizeReadingCursor(cursorRef.current, currentEntries);
    let next = current;
    if (direction === 'previous' && current.pageIndex > 0) {
      next = { ...current, pageIndex: current.pageIndex - 1 };
    } else if (direction === 'previous' && current.entryIndex > 0) {
      const entryIndex = current.entryIndex - 1;
      next = { entryIndex, pageIndex: currentEntries[entryIndex].pageCount - 1 };
    } else if (direction === 'next'
      && current.pageIndex < (currentEntries[current.entryIndex]?.pageCount || 0) - 1) {
      next = { ...current, pageIndex: current.pageIndex + 1 };
    } else if (direction === 'next' && current.entryIndex < currentEntries.length - 1) {
      next = { entryIndex: current.entryIndex + 1, pageIndex: 0 };
    } else if (direction === 'latest' && currentEntries.length > 0) {
      const entryIndex = currentEntries.length - 1;
      next = { entryIndex, pageIndex: currentEntries[entryIndex].pageCount - 1 };
    }
    if (next.entryIndex === current.entryIndex && next.pageIndex === current.pageIndex) return false;
    transitionRef.current = true;
    commit(next);
    timerRef.current = setTimeout(() => {
      transitionRef.current = false;
      timerRef.current = null;
    }, SEGMENT_TRANSITION_MS);
    return true;
  }, [commit]);
  const previous = React.useCallback(event => move(event, 'previous'), [move]);
  const next = React.useCallback(event => move(event, 'next'), [move]);
  const latest = React.useCallback(event => move(event, 'latest'), [move]);
  const navigate = React.useCallback((type) => {
    if (type === 'reading.previous') return previous();
    if (type === 'reading.next') return next();
    if (type === 'reading.latest') return latest();
    return false;
  }, [latest, next, previous]);

  React.useEffect(() => {
    if (!enabled) return undefined;
    const view = surfaceRef?.current?.ownerDocument?.defaultView;
    if (!view) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Enter' || event.repeat || event.isComposing
        || event.altKey || event.ctrlKey || event.metaKey) return;
      if (next(event)) event.preventDefault();
    };
    view.addEventListener('keydown', handleKeyDown);
    return () => view.removeEventListener('keydown', handleKeyDown);
  }, [enabled, next, surfaceRef]);

  const activeCursor = normalizeReadingCursor(cursor, entries);
  const activeEntry = entries[activeCursor.entryIndex];
  useReadingCheckpoint({ enabled, isLoading, entries, activeCursor, activeEntry, messages,
    onReadProgress, onPositionChange });
  const isHistory = Boolean(enabled && activeEntry && activeCursor.entryIndex < entries.length - 1);
  const canPrevious = Boolean(enabled) && (
    activeCursor.pageIndex > 0 || activeCursor.entryIndex > 0
  );
  const canNext = Boolean(enabled && activeEntry) && (
    activeCursor.pageIndex < activeEntry.pageCount - 1
    || activeCursor.entryIndex < entries.length - 1
  );
  const displayMessages = isHistory && activeEntry?.messageIndex >= 0
    ? [{ ...messages[activeEntry.messageIndex], _renderIndex: activeEntry.messageIndex }]
    : messages;

  return {
    advanceVisiblePage: next,
    displayIsLoading: isLoading && !isHistory,
    displayMessages,
    isHistory,
    isStreaming: activeEntry?.streaming === true,
    messageIndex: activeEntry?.messageIndex ?? -1,
    navigate,
    pageIndex: activeCursor.pageIndex,
    ui: {
      enabled,
      canPrevious,
      canNext,
      atLatest: !canNext,
      messageIndex: activeEntry?.messageIndex ?? -1,
      segmentIndex: activeCursor.pageIndex
    }
  };
}

export {
  INTERACTIVE_SELECTOR,
  SEGMENT_TRANSITION_MS,
  isSegmentAdvanceEvent
};
export { resolveReadingSegments, splitReadingSegments } from './segmentedReadingModel.js';
export default useSegmentedReading;
