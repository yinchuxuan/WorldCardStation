import React from 'react';
import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';
import { createLatestSaveQueue } from './latestSaveQueue.js';
import { rendererServices } from '../platform/index.js';

function normalizedViewState(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function useChatPersistence({ messages, gameState, isLoading, repository = rendererServices.sessions }) {
  const retryBaseRef = React.useRef(null);
  const retryBaseStateRef = React.useRef(null);
  const viewStateRef = React.useRef({});
  const readingRestoreTokenRef = React.useRef(0);
  const loadedRef = React.useRef(false);
  const [viewState, setViewState] = React.useState({});
  const messagesRef = React.useRef(messages);
  const gameStateRef = React.useRef(gameState);
  messagesRef.current = messages;
  gameStateRef.current = gameState;
  const saveQueue = React.useMemo(() => createLatestSaveQueue(snapshot => (
    repository.saveHistory(snapshot.messages, snapshot.options)
  )), [repository]);

  const hydrate = React.useCallback((result = {}) => {
    if (Array.isArray(result.retryBaseMessages)) retryBaseRef.current = result.retryBaseMessages;
    if (result.retryBaseState !== undefined) retryBaseStateRef.current = result.retryBaseState;
    const nextViewState = normalizedViewState(result.viewState);
    viewStateRef.current = nextViewState;
    readingRestoreTokenRef.current += 1;
    setViewState(nextViewState);
  }, []);

  const reset = React.useCallback(() => {
    loadedRef.current = false;
    retryBaseRef.current = null;
    retryBaseStateRef.current = null;
    viewStateRef.current = {};
    readingRestoreTokenRef.current += 1;
    setViewState({});
  }, []);

  const setRetryBase = React.useCallback((nextMessages, nextState) => {
    retryBaseRef.current = cloneJson(nextMessages || []);
    retryBaseStateRef.current = cloneJson(nextState || {});
  }, []);

  const snapshot = React.useCallback((nextMessages, nextState) => ({
    messages: nextMessages ?? messagesRef.current,
    options: {
      gameState: nextState ?? gameStateRef.current,
      retryBaseMessages: retryBaseRef.current,
      retryBaseState: retryBaseStateRef.current,
      viewState: viewStateRef.current
    }
  }), []);
  const save = React.useCallback((nextMessages, nextState) => {
    if (!loadedRef.current) return Promise.reject(new Error('会话尚未成功加载，不能保存'));
    return saveQueue.flush(snapshot(nextMessages, nextState));
  }, [saveQueue, snapshot]);
  const flush = React.useCallback(() => (
    loadedRef.current ? saveQueue.flush(snapshot()) : saveQueue.waitForIdle()
  ), [saveQueue, snapshot]);

  const setReadingPosition = React.useCallback((position) => {
    const messageId = String(position?.messageId || '');
    const segmentIndex = Number.isInteger(position?.segmentIndex) ? position.segmentIndex : 0;
    if (!messageId || segmentIndex < 0) return;
    const current = viewStateRef.current;
    if (current.reading?.messageId === messageId
      && current.reading?.segmentIndex === segmentIndex) return;
    const next = { ...current, reading: { messageId, segmentIndex } };
    viewStateRef.current = next;
    setViewState(next);
  }, []);

  React.useEffect(() => {
    if (!loadedRef.current || isLoading) return;
    void saveQueue.enqueue(snapshot()).catch(() => {});
  }, [gameState, isLoading, messages, saveQueue, snapshot, viewState]);

  const markLoaded = React.useCallback(() => { loadedRef.current = true; }, []);

  return React.useMemo(() => ({
    hydrate,
    flush,
    markLoaded,
    reset,
    retryBaseRef,
    retryBaseStateRef,
    get readingPosition() { return viewStateRef.current.reading || null; },
    get readingRestoreToken() { return readingRestoreTokenRef.current; },
    save,
    setReadingPosition,
    setRetryBase
  }), [flush, hydrate, markLoaded, reset, save, setReadingPosition, setRetryBase]);
}

export default useChatPersistence;
