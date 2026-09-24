import React from 'react';

const STREAM_FLUSH_CHARS = 96;
const STREAM_FLUSH_INTERVAL_MS = 50;

// Batches presentation updates only. Model protocol parsing belongs to the transport/runtime.
export default function useTypewriter() {
  const [streamContent, setStreamContent] = React.useState('');
  const [streamMessageId, setStreamMessageId] = React.useState('');
  const content = React.useRef(''), flushed = React.useRef(0), timer = React.useRef(null);
  const cancel = React.useCallback(() => { clearTimeout(timer.current); timer.current = null; }, []);
  const flush = React.useCallback(() => {
    cancel(); flushed.current = content.current.length; setStreamContent(content.current);
  }, [cancel]);
  React.useEffect(() => cancel, [cancel]);
  const startStreaming = React.useCallback((id = '') => {
    cancel(); content.current = ''; flushed.current = 0; setStreamContent(''); setStreamMessageId(id);
  }, [cancel]);
  const pushContent = React.useCallback(text => {
    if (!text) return;
    content.current += text;
    if (!flushed.current || content.current.length - flushed.current >= STREAM_FLUSH_CHARS) flush();
    else if (timer.current === null) timer.current = setTimeout(flush, STREAM_FLUSH_INTERVAL_MS);
  }, [flush]);
  return { streamContent, displayedCount: streamContent.length, streamMessageId,
    startStreaming, pushContent, finishStreaming: flush, getAccumulatedContent: () => content.current };
}

export { STREAM_FLUSH_CHARS, STREAM_FLUSH_INTERVAL_MS };
