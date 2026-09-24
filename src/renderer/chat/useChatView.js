import React from 'react';
import useTypewriter from './useTypewriter.js';

// Presentation adapter only: all generation, cancellation and retry belong to mainSession.
export default function useChatView(view, isLoading) {
  const [expandedThinking, setExpandedThinking] = React.useState({});
  const [showStreamThinking, setShowStreamThinking] = React.useState(true);
  const typewriter = useTypewriter();
  const previous = React.useRef({});
  const source = view.messages || [];
  const assistants = view.contexts.chat?.messages.filter(msg => msg.role === 'assistant') || [];
  let assistantIndex = 0;
  const messages = source.map(msg => {
    if (msg.role !== 'assistant') return msg;
    const agent = assistants[assistantIndex++];
    return { ...msg, _thinking: agent?.thinking || msg.thinking || msg._thinking,
      _thinkingVisible: Boolean(expandedThinking[msg.id]) };
  });
  const lastUser = messages.findLastIndex(msg => msg.role === 'user');
  const streaming = isLoading && lastUser >= 0;
  const current = streaming && messages.at(-1)?.role === 'assistant' ? messages.at(-1) : null;
  const content = current?.content || '';
  const turnId = streaming ? messages[lastUser].id : null;
  React.useEffect(() => {
    if (turnId !== previous.current.id) {
      typewriter.startStreaming(turnId ? `stream-${turnId}` : '');
      previous.current = { id: turnId, content: '' };
      setShowStreamThinking(true);
    }
    if (turnId && content.startsWith(previous.current.content)) {
      typewriter.pushContent(content.slice(previous.current.content.length));
      previous.current.content = content;
    }
  }, [turnId, content, typewriter.startStreaming, typewriter.pushContent]);
  return {
    messages: streaming ? messages.slice(0, lastUser + 1) : messages,
    streaming,
    typewriter,
    currentThinking: streaming ? view.thinkingPreview?.text || current?._thinking || null : null,
    showStreamThinking, setShowStreamThinking,
    toggleThinking(index) {
      const id = messages[index]?.id;
      setExpandedThinking(previous => ({ ...previous, [id]: !previous[id] }));
    }
  };
}
