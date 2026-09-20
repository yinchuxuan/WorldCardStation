import React from 'react';
import generationServices from './generationServices.js';
import { ensureMessageIds } from './messageIds.js';
import { normalizeGameCardError } from '../gameCard/runtimeError.js';
import { rendererServices, savePolicy } from '../platform/index.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';

function useChatSession({
  setMessages,
  setGameState,
  setRuntimeError,
  isLoading,
  persistence,
  typewriter,
  onResetView,
  onSessionLoaded,
  repository = rendererServices.sessions
}) {
  const [revision, setRevision] = React.useState(0);
  const loadCurrent = React.useCallback(async () => {
    persistence.reset();
    try {
      const result = await repository.loadHistory();
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
      setRuntimeError(normalizeGameCardError(error));
      return null;
    }
  }, [onSessionLoaded, persistence, repository, setGameState, setMessages, setRuntimeError]);

  const load = React.useCallback(() => {
    setRevision(value => value + 1);
    return loadCurrent();
  }, [loadCurrent]);

  React.useEffect(() => { void load(); }, [load]);

  const saveCurrent = React.useCallback(async () => {
    if (isLoading) return null;
    return persistence.save();
  }, [isLoading, persistence]);

  const reload = React.useCallback(async () => {
    typewriter.clearStreaming();
    onResetView?.();
    return load();
  }, [load, onResetView, typewriter]);

  const switchSession = React.useCallback(async (id) => {
    setRevision(value => value + 1);
    await saveCurrent();
    const result = await repository.setActive(id);
    typewriter.clearStreaming();
    onResetView?.();
    await loadCurrent();
    return { success: true, ...result };
  }, [loadCurrent, onResetView, repository, saveCurrent, typewriter]);

  return { load, reload, revision, saveCurrent, switchSession };
}

export default useChatSession;
