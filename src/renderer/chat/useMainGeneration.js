import React from 'react';
import { createChatMessage } from './messageIds.js';

// Internal injection point until the V2 import/player entry is delivered.
function useMainGeneration({ mainSession, setMessages, setGameState, setIsLoading, setRequestError, canMutate }) {
  const current = React.useRef(mainSession);
  const history = React.useRef({ messages: [], baseline: [] });
  React.useEffect(() => {
    current.current = mainSession;
    history.current = { messages: [], baseline: [] };
    if (mainSession) { setIsLoading(false); setMessages(mainSession.snapshot().messages || mainSession.snapshot().records || []); }
    return () => {
      current.current = null;
      void mainSession?.dispose();
    };
  }, [mainSession, setIsLoading, setMessages]);
  async function run(input, retry) {
    if (!mainSession || current.current !== mainSession || mainSession.running || mainSession.ready === false) return false;
    if (canMutate?.() === false) return false;
    if (!retry && !String(input || '').trim()) return false;
    if (input !== undefined) history.current.input = input;
    const base = retry ? history.current.baseline : history.current.messages;
    if (!retry) history.current.baseline = base;
    setIsLoading(true);
    setRequestError?.(null);
    const content = input ?? history.current.input;
    const user = createChatMessage({ role: 'user', content });
    const existing = new Set(base.filter(msg => msg.role === 'assistant').map(msg => msg.id));
    const visible = records => [...base, user, ...(records || []).filter(record => !existing.has(record.id) && record.content)];
    const unsubscribe = mainSession.subscribe?.((view, detail) => {
      if (current.current === mainSession && detail.type !== 'rollback') setMessages(view.messages || visible(view.records));
    });
    try {
      const result = await (retry ? mainSession.retry(input) : mainSession.send(input));
      if (current.current !== mainSession) return false;
      history.current = { messages: result.messages || visible(result.records), baseline: base, input: content };
      setMessages(history.current.messages);
      setGameState(result.state);
      return true;
    } catch (error) {
      if (current.current === mainSession) {
        history.current.messages = base;
        setMessages(mainSession.snapshot().messages || base);
        setGameState(mainSession.snapshot().state);
        setRequestError?.(`本轮未完成：${error.message}`);
      }
      return false;
    } finally {
      unsubscribe?.();
      if (current.current === mainSession) setIsLoading(false);
    }
  }
  return {
    send: input => run(input, false),
    retry: input => run(input, true),
    stop: () => mainSession?.cancel()
  };
}

export default useMainGeneration;
