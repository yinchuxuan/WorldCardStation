import React from 'react';

const STREAM_FLUSH_INTERVAL_MS = 50;
const STREAM_FLUSH_CHARS = 96;

function useTypewriter() {
  const [streamContent, setStreamContent] = React.useState('');
  const [rawStreamContent, setRawStreamContent] = React.useState('');
  const [displayedCount, setDisplayedCount] = React.useState(0);
  const [thinkingContent, setThinkingContent] = React.useState('');
  const [thinkingDone, setThinkingDone] = React.useState(false);
  const [streamMessageId, setStreamMessageId] = React.useState('');
  const streamContentRef = React.useRef('');
  const rawContentRef = React.useRef('');
  const appliedPatchCountRef = React.useRef(0);
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
    setRawStreamContent(rawContentRef.current);
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
    appliedPatchCountRef.current = 0;
    lastFlushedLengthRef.current = 0;
    setStreamContent('');
    setRawStreamContent('');
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
    setThinkingDone(false);
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
      setThinkingDone(true);
      appended += appendContent(after.slice(foundClose + 11));
      return appended;
    }
    if (foundClose !== -1 && inThinkingRef.current) {
      thinkingRef.current += delta.slice(0, foundClose);
      inThinkingRef.current = false;
      thinkingDoneRef.current = true;
      setThinkingContent(thinkingRef.current);
      setThinkingDone(true);
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
    setRawStreamContent(rawContentRef.current);
  }, []);
  const finishStreaming = React.useCallback(() => flushVisibleContent(), [flushVisibleContent]);
  const getAccumulatedContent = React.useCallback(() => streamContentRef.current, []);
  const getRawContent = React.useCallback(() => rawContentRef.current, []);
  const getAppliedPatchCount = React.useCallback(() => appliedPatchCountRef.current, []);
  const markPatchApplied = React.useCallback((count) => {
    appliedPatchCountRef.current = Math.max(appliedPatchCountRef.current, count);
  }, []);
  const getThinkingContent = React.useCallback(() => thinkingRef.current, []);
  const reset = React.useCallback(() => {
    clearContent();
    thinkingRef.current = '';
    inThinkingRef.current = false;
    thinkingDoneRef.current = false;
    setThinkingContent('');
    setThinkingDone(false);
  }, [clearContent]);

  return { streamContent, rawStreamContent, displayedCount, startStreaming, pushContent,
    pushProtocolContent, finishStreaming, getAccumulatedContent, getRawContent,
    getAppliedPatchCount, markPatchApplied, getThinkingContent, reset,
    clearStreaming: clearContent, thinkingContent, thinkingDone, streamMessageId };
}

export { STREAM_FLUSH_CHARS, STREAM_FLUSH_INTERVAL_MS };
export default useTypewriter;
