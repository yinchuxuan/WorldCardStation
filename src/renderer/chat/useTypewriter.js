import React from 'react';

const STREAM_FLUSH_INTERVAL_MS = 50;
const STREAM_FLUSH_CHARS = 96;

function useTypewriter() {
  const [streamContent, setStreamContent] = React.useState('');
  const [displayedCount, setDisplayedCount] = React.useState(0);
  const [thinkingContent, setThinkingContent] = React.useState('');
  const [streamMessageId, setStreamMessageId] = React.useState('');
  const streamContentRef = React.useRef('');
  const rawContentRef = React.useRef('');
  const lastFlushedLengthRef = React.useRef(0);
  const flushTimerRef = React.useRef(null);
  const thinkingRef = React.useRef('');
  const inThinkingRef = React.useRef(false);
  const thinkingDoneRef = React.useRef(false);

  const cancelFlush = React.useCallback(() => {
    if (flushTimerRef.current === null) return;
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
  }, []);

  const flushVisibleContent = React.useCallback(() => {
    cancelFlush();
    const content = streamContentRef.current;
    lastFlushedLengthRef.current = content.length;
    setStreamContent(content);
    setDisplayedCount(content.length);
  }, [cancelFlush]);

  const scheduleFlush = React.useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = setTimeout(flushVisibleContent, STREAM_FLUSH_INTERVAL_MS);
  }, [flushVisibleContent]);

  const appendContent = React.useCallback((text) => {
    if (!text) return '';
    streamContentRef.current += text;
    rawContentRef.current += text;
    const pendingLength = streamContentRef.current.length - lastFlushedLengthRef.current;
    if (lastFlushedLengthRef.current === 0 || pendingLength >= STREAM_FLUSH_CHARS) {
      flushVisibleContent();
    } else {
      scheduleFlush();
    }
    return text;
  }, [flushVisibleContent, scheduleFlush]);

  React.useEffect(() => cancelFlush, [cancelFlush]);

  const clearContent = React.useCallback(() => {
    cancelFlush();
    streamContentRef.current = '';
    rawContentRef.current = '';
    lastFlushedLengthRef.current = 0;
    setStreamContent('');
    setDisplayedCount(0);
    setStreamMessageId('');
  }, [cancelFlush]);

  const startStreaming = React.useCallback((messageId = '') => {
    clearContent();
    setStreamMessageId(messageId);
    thinkingRef.current = '';
    inThinkingRef.current = false;
    thinkingDoneRef.current = false;
    setThinkingContent('');
  }, [clearContent]);

  const pushContent = React.useCallback((delta, type) => {
    if (type === 'reasoning') {
      thinkingRef.current += delta;
      setThinkingContent(thinkingRef.current);
      return '';
    }
    let foundOpen = -1;
    let foundClose = -1;
    if (!inThinkingRef.current && !thinkingDoneRef.current) foundOpen = delta.indexOf('<thinking>');
    if (inThinkingRef.current) foundClose = delta.indexOf('</thinking>');

    if (foundOpen !== -1 && !inThinkingRef.current && !thinkingDoneRef.current) {
      let appended = appendContent(delta.slice(0, foundOpen));
      inThinkingRef.current = true;
      const after = delta.slice(foundOpen + 10);
      foundClose = after.indexOf('</thinking>');
      if (foundClose === -1) {
        thinkingRef.current += after;
        setThinkingContent(thinkingRef.current);
        return appended;
      }
      thinkingRef.current += after.slice(0, foundClose);
      inThinkingRef.current = false;
      thinkingDoneRef.current = true;
      setThinkingContent(thinkingRef.current);
      appended += appendContent(after.slice(foundClose + 11));
      return appended;
    }
    if (foundClose !== -1 && inThinkingRef.current) {
      thinkingRef.current += delta.slice(0, foundClose);
      inThinkingRef.current = false;
      thinkingDoneRef.current = true;
      setThinkingContent(thinkingRef.current);
      return appendContent(delta.slice(foundClose + 11));
    }
    if (inThinkingRef.current) {
      thinkingRef.current += delta;
      setThinkingContent(thinkingRef.current);
      return '';
    }
    return appendContent(delta);
  }, [appendContent]);

  const pushProtocolContent = React.useCallback((text) => {
    if (!text) return;
    rawContentRef.current += text;
  }, []);
  const finishStreaming = React.useCallback(() => flushVisibleContent(), [flushVisibleContent]);
  const getAccumulatedContent = React.useCallback(() => streamContentRef.current, []);
  const getRawContent = React.useCallback(() => rawContentRef.current, []);
  const getThinkingContent = React.useCallback(() => thinkingRef.current, []);
  const reset = React.useCallback(() => {
    clearContent();
    thinkingRef.current = '';
    inThinkingRef.current = false;
    thinkingDoneRef.current = false;
    setThinkingContent('');
  }, [clearContent]);

  return { streamContent, displayedCount, startStreaming, pushContent,
    pushProtocolContent, finishStreaming, getAccumulatedContent, getRawContent,
    getThinkingContent, reset,
    clearStreaming: clearContent, thinkingContent, streamMessageId };
}

export { STREAM_FLUSH_CHARS, STREAM_FLUSH_INTERVAL_MS };
export default useTypewriter;
