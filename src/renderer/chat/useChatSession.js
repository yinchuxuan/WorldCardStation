import React from 'react';
import { normalizeGameCardError } from '../gameCard/runtimeError.js';
import { rendererServices, savePolicy } from '../platform/index.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';

function useChatSession({
  enabled = true,
  mainSession,
  setMessages,
  setGameState,
  setRuntimeError,
  isLoading,
  setIsLoading,
  persistence,
  onResetView,
  repository = rendererServices.sessions
}) {
  const [revision, setRevision] = React.useState(0);
  const loadToken = React.useRef(0);
  const loadCurrent = React.useCallback(async () => {
    if (!enabled) return null;
    const token = ++loadToken.current;
    persistence.reset();
    setIsLoading?.(true);
    try {
      await mainSession.beginLoad();
      if (token !== loadToken.current) return null;
      const result = await repository.loadHistory();
      if (token !== loadToken.current) return null;
      if (result.sessionMissing) {
        setMessages([]); setGameState({}); setRuntimeError(null);
        return result;
      }
      const restored = mainSession.restoreHistory(result);
      await runtimeTrace.bind(result.traceScope || null, restored.messages, restored.state);
      if (token !== loadToken.current) return null;
      persistence.hydrate(result);
      setRuntimeError(null);
      await mainSession.start();
      if (token !== loadToken.current) return null;
      persistence.markLoaded();
      return result;
    } catch (error) {
      if (token === loadToken.current) setRuntimeError(normalizeGameCardError(error));
      return null;
    } finally { if (token === loadToken.current) setIsLoading?.(Boolean(mainSession?.running)); }
  }, [enabled, mainSession, persistence, repository, setGameState, setMessages, setRuntimeError, setIsLoading]);

  const load = React.useCallback(() => {
    setRevision(value => value + 1);
    return loadCurrent();
  }, [loadCurrent]);

  React.useEffect(() => { void load(); return () => { loadToken.current += 1; }; }, [load]);

  const saveCurrent = React.useCallback(async () => {
    if (isLoading) throw new Error('操作尚未完成，请稍后保存');
    if (mainSession?.failed) return null;
    if (mainSession && !mainSession.started) return null;
    return persistence.save();
  }, [isLoading, persistence, mainSession]);
  const beforeLeave = React.useCallback(async () => {
    if (savePolicy === 'manual') return persistence.manual.requestLeave();
    await saveCurrent();
    return true;
  }, [persistence, saveCurrent]);

  const reload = React.useCallback(async () => {
    onResetView?.();
    return load();
  }, [load, onResetView]);

  const switchSession = React.useCallback(async (id) => {
    if (!await beforeLeave()) return { canceled: true };
    try {
      setRevision(value => value + 1);
      const result = await repository.setActive(id);
      onResetView?.();
      await loadCurrent();
      return { success: true, ...result };
    } finally { if (savePolicy === 'manual') persistence.manual.endLeave(); }
  }, [beforeLeave, loadCurrent, onResetView, persistence, repository]);

  return { load, reload, revision, saveCurrent, beforeLeave, afterLeave: persistence.manual?.endLeave, switchSession };
}

export default useChatSession;
