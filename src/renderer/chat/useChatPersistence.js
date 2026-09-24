import React from 'react';
import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';
import { createLatestSaveQueue } from './latestSaveQueue.js';
import { rendererServices, savePolicy } from '../platform/index.js';
import useManualSave from './useManualSave.js';

function normalizedViewState(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function useChatPersistence({ messages, gameState, isLoading, enabled = true, mainSession, repository = rendererServices.sessions }) {
  const retryBaseRef = React.useRef(null);
  const retryBaseStateRef = React.useRef(null);
  const viewStateRef = React.useRef({});
  const loadedRef = React.useRef(false);
  const [viewRevision, invalidateView] = React.useReducer(value => value + 1, 0);
  const errorRef = React.useRef(null);
  const [, renderError] = React.useReducer(value => value + 1, 0);
  const setError = React.useCallback(value => {
    if (errorRef.current === value) return;
    errorRef.current = value; renderError();
  }, []);
  const messagesRef = React.useRef(messages);
  const gameStateRef = React.useRef(gameState);
  const mainRef = React.useRef(mainSession);
  mainRef.current = mainSession;
  messagesRef.current = messages;
  gameStateRef.current = gameState;
  const saveQueue = React.useMemo(() => createLatestSaveQueue(async snapshot => {
    try { const result = await repository.saveHistory(snapshot.messages, snapshot.options); setError(null); return result; }
    catch (failure) { setError(failure); throw failure; }
  }), [repository, setError]);

  const hydrate = React.useCallback((result = {}) => {
    if (Array.isArray(result.retryBaseMessages)) retryBaseRef.current = result.retryBaseMessages;
    if (result.retryBaseState !== undefined) retryBaseStateRef.current = result.retryBaseState;
    const nextViewState = normalizedViewState(result.viewState);
    viewStateRef.current = nextViewState;
    invalidateView();
    manualRef.current.hydrate(result);
  }, []);

  const reset = React.useCallback(() => {
    loadedRef.current = false;
    manualRef.current.resetInput();
    setError(null);
    retryBaseRef.current = null;
    retryBaseStateRef.current = null;
    viewStateRef.current = {};
    invalidateView();
  }, []);

  const setRetryBase = React.useCallback((nextMessages, nextState) => {
    retryBaseRef.current = cloneJson(nextMessages || []);
    retryBaseStateRef.current = cloneJson(nextState || {});
  }, []);

  const snapshot = React.useCallback((nextMessages, nextState) => {
    if (mainRef.current?.exportSession) {
      const runtimeSession = mainRef.current.exportSession();
      return { messages: runtimeSession.current.messages, options: { gameState: runtimeSession.current.state,
        viewState: runtimeSession.viewState, runtimeSession } };
    }
    return {
      messages: nextMessages ?? messagesRef.current,
      options: {
        gameState: nextState ?? gameStateRef.current,
        retryBaseMessages: retryBaseRef.current,
        retryBaseState: retryBaseStateRef.current,
        viewState: viewStateRef.current
      }
    };
  }, []);
  const manual = useManualSave({ snapshot, loadedRef, repository, isLoading, enabled, incomplete: Boolean(mainSession?.failed) });
  const manualRef = React.useRef(manual);
  manualRef.current = manual;
  const save = React.useCallback((nextMessages, nextState) => {
    if (!enabled) return Promise.reject(new Error('此运行时尚未接入存档，不能保存'));
    if (!loadedRef.current) return Promise.reject(new Error('会话尚未成功加载，不能保存'));
    if (mainRef.current?.running) return Promise.reject(new Error('操作尚未完成，请稍后保存'));
    if (mainRef.current?.failed) return Promise.reject(new Error('本轮未完成，不能保存失败现场'));
    if (savePolicy === 'manual') return manual.save();
    return saveQueue.flush(snapshot(nextMessages, nextState));
  }, [enabled, manual, saveQueue, snapshot]);
  const flush = React.useCallback(() => (
    enabled && loadedRef.current && !mainRef.current?.failed ? (savePolicy === 'manual' ? manual.save() : saveQueue.flush(snapshot())) : saveQueue.waitForIdle()
  ), [enabled, manual, saveQueue, snapshot]);

  // The runtime owns reading positions; this only schedules persistence of its latest view.
  const notifyViewChanged = React.useCallback(() => { invalidateView(); }, []);

  React.useEffect(() => {
    if (!enabled || savePolicy === 'manual' || !loadedRef.current || isLoading || mainSession?.running || mainSession?.failed) return;
    void saveQueue.enqueue(snapshot()).catch(() => {});
  }, [enabled, gameState, isLoading, messages, saveQueue, snapshot, viewRevision, mainSession]);

  const markLoaded = React.useCallback(() => { loadedRef.current = true; manual.changed(); }, [manual]);

  return React.useMemo(() => ({
    get error() { return errorRef.current; },
    hydrate,
    manual,
    flush,
    markLoaded,
    reset,
    retryBaseRef,
    retryBaseStateRef,
    save,
    notifyViewChanged,
    setRetryBase
  }), [flush, hydrate, manual, markLoaded, reset, save, notifyViewChanged, setRetryBase]);
}

export default useChatPersistence;
