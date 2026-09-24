import React from 'react';
import * as chatGeneration from './chatGeneration.js';
import useGenerationAbort from './useGenerationAbort.js';
import { createChatMessage } from './messageIds.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';
import useMainGeneration from './useMainGeneration.js';

function useChatGeneration({
  mainSession,
  messages,
  setMessages,
  gameState,
  setGameState,
  modelConfig,
  typewriter,
  persistence,
  isLoading,
  setIsLoading,
  setRuntimeError,
  setRequestError,
  setShowStreamThinking,
  onAudioSubmit,
  onRetryStateRestore,
  onRequestFailureRestore,
  onValidationRetry,
  onResponseValidationWarning,
  onStreamContentStart,
  onStatePatchApplied,
  onPresentationEffects
}) {
  const generationControl = useGenerationAbort();
  const mainGeneration = useMainGeneration({ mainSession, setRequestError,
    onResponseValidationWarning, canMutate: persistence.manual?.canQueueInput });

  const run = React.useCallback((nextMessages, nextState, appendAssistantWithUpdater = false) => (
    generationControl.trackGeneration(chatGeneration.runChatGeneration({
      messages: nextMessages,
      state: nextState,
      modelConfig,
      setMessages,
      setGameState,
      setIsLoading,
      tw: typewriter,
      setShowStreamThinking,
      onStreamContentStart,
      onStatePatchApplied,
      onPresentationEffects,
      onValidationRetry,
      onRequestFailureRestore,
      onResponseValidationWarning,
      onStreamPreviewState: setGameState,
      onGameCardError: setRuntimeError,
      onRequestError: setRequestError,
      ...generationControl,
      appendAssistantWithUpdater
    }))
  ), [generationControl, modelConfig, onPresentationEffects, onRequestFailureRestore, onResponseValidationWarning,
    onStatePatchApplied, onStreamContentStart, onValidationRetry,
    setGameState, setMessages, setRequestError, setRuntimeError, setShowStreamThinking, typewriter]);

  const send = React.useCallback(async (rawValue) => {
    const value = String(rawValue || '');
    if (!value.trim() || isLoading || persistence.manual?.canMutate() === false) return false;
    if (!modelConfig?.apiUrl || !modelConfig?.apiKey) {
      setMessages(prev => [...prev, createChatMessage({ role: 'user', content: value })]);
      setRequestError?.('请先在右侧设置面板配置模型 API');
      return true;
    }
    onAudioSubmit?.();
    onResponseValidationWarning?.(null);
    const nextMessages = [...messages, createChatMessage({ role: 'user', content: value })];
    persistence.setRetryBase(nextMessages, gameState);
    await run(nextMessages, gameState, true);
    return true;
  }, [gameState, isLoading, messages, modelConfig, onAudioSubmit, onResponseValidationWarning,
    persistence, run, setMessages, setRequestError]);

  const retry = React.useCallback(async (editedContent) => {
    if (persistence.manual?.canMutate() === false) return false;
    if (!modelConfig?.apiUrl || !modelConfig?.apiKey) return false;
    if (chatGeneration.findLastUserIndex(messages) < 0) return false;
    onAudioSubmit?.();
    onResponseValidationWarning?.(null);
    const retryBaseMessages = persistence.retryBaseRef.current;
    const retryBaseState = persistence.retryBaseStateRef.current;
    await generationControl.stopGeneration();
    const retryMessages = chatGeneration.buildRetryMessages(
      messages, retryBaseMessages, editedContent
    );
    if (!retryMessages) return false;
    const retryState = retryBaseState !== undefined && retryBaseState !== null
      ? chatGeneration.cloneChatValue(retryBaseState)
      : {};
    persistence.setRetryBase(retryMessages, retryState);
    const operation = runtimeTrace.capture().begin('retry.restore', { messages, state: gameState });
    operation?.end({ messages: retryMessages, state: retryState }, 'restored');
    setGameState(retryState);
    onRetryStateRestore?.(retryState);
    return run(retryMessages, retryState);
  }, [gameState, generationControl, messages, modelConfig, onAudioSubmit, onResponseValidationWarning,
    onRetryStateRestore, persistence, run, setGameState]);

  const legacyGeneration = React.useMemo(() => ({
    isLoading,
    retry,
    send,
    stop: generationControl.stopGeneration
  }), [generationControl.stopGeneration, isLoading, retry, send]);
  return mainSession ? { ...mainGeneration, isLoading } : legacyGeneration;
}

export default useChatGeneration;
