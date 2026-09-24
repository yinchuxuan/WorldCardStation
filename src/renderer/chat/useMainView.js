import React from 'react';

const EMPTY_VIEW = { state: {}, contexts: {}, records: [], messages: [], reading: null };
const read = session => session?.view?.() || session?.snapshot?.() || EMPTY_VIEW;

// The single bridge that publishes runtime data into React. It does not own the Session.
export default function useMainView({ mainSession, setMessages, setGameState, setIsLoading }) {
  const callbacks = React.useRef();
  callbacks.current = { setMessages, setGameState, setIsLoading };
  const [current, setCurrent] = React.useState(() => ({ session: mainSession, view: read(mainSession) }));
  React.useEffect(() => {
    if (!mainSession) return undefined;
    let active = true;
    const sync = view => {
      if (!active) return;
      setCurrent({ session: mainSession, view });
      callbacks.current.setMessages?.(view.messages || view.records || []);
      callbacks.current.setGameState?.(view.state);
      callbacks.current.setIsLoading?.(Boolean(mainSession.running));
    };
    sync(read(mainSession));
    const unsubscribe = mainSession.subscribe(sync);
    return () => { active = false; unsubscribe?.(); };
  }, [mainSession]);
  return current.session === mainSession ? current.view : read(mainSession);
}
