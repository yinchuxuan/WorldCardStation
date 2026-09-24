import React from 'react';

// Acceptance clears the draft immediately; completion is observed independently.
function useMainGeneration({ mainSession, setRequestError, canMutate, onResponseValidationWarning }) {
  const current = React.useRef(mainSession);
  const operation = React.useRef(0);
  const warningCallback = React.useRef(onResponseValidationWarning);
  warningCallback.current = onResponseValidationWarning;
  React.useEffect(() => {
    current.current = mainSession;
    const seen = new Set();
    let violations = [];
    if (mainSession) warningCallback.current?.(null);
    const sync = (view, detail = {}) => {
      if (current.current !== mainSession) return;
      if (['start', 'loading', 'restore'].includes(detail.type)) {
        seen.clear(); violations = [];
        warningCallback.current?.(null);
      } else if (detail.type === 'agent-response' && detail.warnings?.length) {
        const key = `${detail.agentId}:${detail.messageId}`;
        if (seen.has(key)) return;
        seen.add(key);
        violations = [...violations, ...detail.warnings.map(item => ({ ...item, agentId: detail.agentId }))];
        warningCallback.current?.({ violations, retryExhausted: false });
      }
    };
    const unsubscribe = mainSession?.subscribe?.(sync);
    return () => {
      current.current = null;
      unsubscribe?.();
    };
  }, [mainSession]);
  function allowed() {
    return mainSession && current.current === mainSession && mainSession.ready !== false && canMutate?.() !== false;
  }
  async function observe(promise, token) {
    try { await promise; return true; }
    catch (error) {
      if (current.current === mainSession && token === operation.current && error.code !== 'INPUT_DISCARDED') {
        setRequestError?.(`本轮未完成：${error.message}`);
      }
      return false;
    }
  }
  return {
    send(input) {
      if (!allowed() || mainSession.failed || mainSession.queuePaused || !String(input || '').trim()) return false;
      setRequestError?.(null);
      void observe(mainSession.send(input), operation.current);
      return true;
    },
    retry(input) {
      if (!allowed()) return false;
      setRequestError?.(null);
      return observe(mainSession.retry(input), ++operation.current);
    },
    stop() { operation.current += 1; return mainSession?.cancel(); }
  };
}

export default useMainGeneration;
