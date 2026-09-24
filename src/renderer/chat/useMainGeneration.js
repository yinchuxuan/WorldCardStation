import React from 'react';
import { createChatMessage } from './messageIds.js';

// Internal injection point until V2 import, presentation and persistence are delivered.
function useMainGeneration({ mainSession, setMessages, setGameState, setIsLoading, setRequestError }) {
  const current = React.useRef(mainSession);
  const history = React.useRef({ messages: [], baseline: [] });
  React.useEffect(() => {
    current.current = mainSession;
    history.current = { messages: [], baseline: [] };
    if (mainSession) setIsLoading(false);
    return () => {
      current.current = null;
      void mainSession?.dispose();
    };
  }, [mainSession, setIsLoading]);
  async function run(input, retry) {
    if (!mainSession || current.current !== mainSession || mainSession.running) return false;
    if (!retry && !String(input || '').trim()) return false;
    if (input !== undefined) history.current.input = input;
    const base = retry ? history.current.baseline : history.current.messages;
    if (!retry) history.current.baseline = base;
    setIsLoading(true);
    setRequestError?.(null);
    try {
      const result = await (retry ? mainSession.retry(input) : mainSession.send(input));
      if (current.current !== mainSession) return false;
      const content = input ?? history.current.input;
      history.current = { messages: [...base, createChatMessage({ role: 'user', content })], baseline: base, input: content };
      setMessages(history.current.messages);
      setGameState(result.state);
      return true;
    } catch (error) {
      if (current.current === mainSession) {
        history.current.messages = base;
        setMessages(base);
        setGameState(mainSession.snapshot().state);
        setRequestError?.(`本轮未完成：${error.message}`);
      }
      return false;
    } finally {
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
