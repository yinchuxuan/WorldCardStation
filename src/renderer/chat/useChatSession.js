import React from 'react';
import generationServices from './generationServices.js';
import { ensureMessageIds } from './messageIds.js';
import { normalizeGameCardError } from '../gameCard/runtimeError.js';
import { rendererServices, savePolicy, gameCardPlatform } from '../platform/index.js';
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
  typewriter,
  onResetView,
  onSessionLoaded,
  repository = rendererServices.sessions
}) {
  const [revision, setRevision] = React.useState(0);
  const loadToken = React.useRef(0);
  const loadCurrent = React.useCallback(async () => {
    if (!enabled) return null;
    const token = ++loadToken.current;
    persistence.reset();
    if (savePolicy === 'manual') setIsLoading?.(true);
    try {
      if (mainSession) {
        await mainSession.beginLoad();
        if (token !== loadToken.current) return null;
        setMessages([]); setGameState(mainSession.snapshot().state);
      }
      const result = await repository.loadHistory();
      if (token !== loadToken.current) return null;
      if (result.sessionMissing) {
        setMessages([]); setGameState({}); setRuntimeError(null);
        onSessionLoaded?.({ card: await gameCardPlatform.repository.getActiveCard(), state: {} });
        return result;
      }
      if (mainSession) {
        const restored = mainSession.restoreHistory(result);
        persistence.hydrate(result);
        setMessages(restored.messages); setGameState(restored.state); setRuntimeError(null);
        persistence.markLoaded();
        return result;
      }
      if (result.runtimeSession !== undefined) throw new Error('此 Session 需要新游戏运行时，不能使用旧播放器恢复');
      persistence.hydrate(result);
      const loadedMessages = result.messages || [];
      const loadedState = result.gameState || {};
      await runtimeTrace.bind(result.traceScope || null, loadedMessages, loadedState);
      const init = await generationServices.prepareInitMessages({ messages: loadedMessages, state: loadedState });
      if (init.error || init.trace?.errors?.length) {
        throw normalizeGameCardError({ ...init, error: init.error || init.trace.errors.join('\n') });
      }
      const initializedMessages = init.changed ? init.messages : loadedMessages;
      const nextMessages = ensureMessageIds(initializedMessages);
      const idsAdded = nextMessages !== initializedMessages;
      const nextState = init.state || loadedState;
      setRuntimeError(null);
      setMessages(nextMessages);
      setGameState(nextState);
      runtimeTrace.update(nextMessages, nextState);
      onSessionLoaded?.({ card: init.card || null, state: nextState });
      persistence.markLoaded();
      if (savePolicy !== 'manual' && (init.changed || idsAdded)) await persistence.save(nextMessages, nextState);
      return result;
    } catch (error) {
      if (token === loadToken.current) setRuntimeError(normalizeGameCardError(error));
      return null;
    } finally { if (token === loadToken.current && savePolicy === 'manual') setIsLoading?.(false); }
  }, [enabled, mainSession, onSessionLoaded, persistence, repository, setGameState, setMessages, setRuntimeError, setIsLoading]);

  const load = React.useCallback(() => {
    setRevision(value => value + 1);
    return loadCurrent();
  }, [loadCurrent]);

  React.useEffect(() => { void load(); return () => { loadToken.current += 1; }; }, [load]);

  const saveCurrent = React.useCallback(async () => {
    if (isLoading) throw new Error('操作尚未完成，请稍后保存');
    return persistence.save();
  }, [isLoading, persistence]);
  const beforeLeave = React.useCallback(async () => {
    if (savePolicy === 'manual') return persistence.manual.requestLeave();
    await saveCurrent();
    return true;
  }, [persistence, saveCurrent]);

  const reload = React.useCallback(async () => {
    typewriter.clearStreaming();
    onResetView?.();
    return load();
  }, [load, onResetView, typewriter]);

  const switchSession = React.useCallback(async (id) => {
    if (!await beforeLeave()) return { canceled: true };
    try {
      setRevision(value => value + 1);
      const result = await repository.setActive(id);
      typewriter.clearStreaming();
      onResetView?.();
      await loadCurrent();
      return { success: true, ...result };
    } finally { if (savePolicy === 'manual') persistence.manual.endLeave(); }
  }, [beforeLeave, loadCurrent, onResetView, persistence, repository, typewriter]);

  return { load, reload, revision, saveCurrent, beforeLeave, afterLeave: persistence.manual?.endLeave, switchSession };
}

export default useChatSession;
