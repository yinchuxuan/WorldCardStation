import React from 'react';
import generationServices from './generationServices.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';

function latestAssistantIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') return index;
  }
  return -1;
}

function playbackMeta(message) {
  return message?._meta?.statePatchPlayback || null;
}

function updatePlayback(messages, messageId, values) {
  return messages.map(message => {
    if (message?.id !== messageId) return message;
    const current = playbackMeta(message) || {};
    return {
      ...message,
      _meta: {
        ...message._meta,
        statePatchPlayback: { ...current, ...values }
      }
    };
  });
}

function useReadingStatePatches({
  card,
  messages,
  setMessages,
  state,
  setState,
  typewriter,
  scopeKey,
  onPatchApplied,
  onPresentationEffects,
  onError,
  beginOperation
}) {
  const messagesRef = React.useRef(messages);
  const stateRef = React.useRef(state);
  const progressRef = React.useRef(new Map());
  const queueRef = React.useRef(Promise.resolve());
  messagesRef.current = messages;
  stateRef.current = state;
  const { getAppliedPatchCount, markPatchApplied } = typewriter;

  React.useEffect(() => {
    progressRef.current = new Map();
    queueRef.current = Promise.resolve();
  }, [scopeKey]);

  const consume = React.useCallback(async ({ entry, message, targetBoundary, terminal, traceContext }) => {
    if (!card || !entry || entry.streaming === false
      && entry.messageIndex !== latestAssistantIndex(messagesRef.current)) return;
    const meta = playbackMeta(message);
    if (!entry.streaming && !meta) return;
    const key = entry.key;
    const saved = progressRef.current.get(key);
    let appliedCount = saved?.appliedCount
      ?? (entry.streaming ? getAppliedPatchCount?.() || 0 : meta.appliedPatchCount || 0);
    let afterResponseApplied = saved?.afterResponseApplied ?? meta?.afterResponseApplied === true;
    const pending = entry.patches.filter(patch => (
      patch.ordinal >= appliedCount && patch.boundary <= targetBoundary
    ));

    for (const patch of pending) {
      const result = await generationServices.prepareStatePatchAtCursor({
        patchText: patch.text,
        messages: messagesRef.current,
        state: stateRef.current,
        card,
        traceContext,
        traceDetails: { origin: 'reading', messageId: message?.id || entry.key, patchOrdinal: patch.ordinal, targetBoundary }
      });
      if (result.error) onError?.(generationServices.normalizeGameCardError(result));
      if (result.applied) {
        stateRef.current = result.state;
        setState(result.state);
        onPatchApplied?.(result);
        await onPresentationEffects?.(result.presentationEffects, {
          card: result.card || card,
          phase: 'state_patch',
          state: result.state
        });
      }
      appliedCount = patch.ordinal + 1;
      markPatchApplied?.(appliedCount);
      progressRef.current.set(key, { appliedCount, afterResponseApplied });
    }

    if (entry.streaming) return;
    let nextMessages = updatePlayback(messagesRef.current, message.id, {
      appliedPatchCount: appliedCount
    });
    messagesRef.current = nextMessages;
    if (!terminal || afterResponseApplied) {
      if (pending.length > 0) setMessages(nextMessages);
      return;
    }

    afterResponseApplied = true;
    progressRef.current.set(key, { appliedCount, afterResponseApplied });
    nextMessages = updatePlayback(nextMessages, message.id, { afterResponseApplied: true });
    const after = await generationServices.prepareAfterResponseMessages({
      messages: nextMessages,
      state: stateRef.current,
      card,
      traceContext,
      traceDetails: { origin: 'reading', messageId: message.id, targetBoundary },
      statePatchesApplied: true
    });
    if (after.error) onError?.(generationServices.normalizeGameCardError(after));
    if (after.state) {
      stateRef.current = after.state;
      setState(after.state);
    }
    await onPresentationEffects?.(after.presentationEffects, {
      card: after.card || card,
      phase: 'after_response',
      state: after.state
    });
    const completed = updatePlayback(after.messages || nextMessages, message.id, {
      appliedPatchCount: appliedCount,
      afterResponseApplied: true
    });
    messagesRef.current = completed;
    setMessages(completed);
  }, [card, getAppliedPatchCount, markPatchApplied, onError, onPatchApplied, onPresentationEffects, setMessages, setState]);

  return React.useCallback((progress) => {
    const end = beginOperation?.();
    const traceContext = runtimeTrace.capture();
    queueRef.current = queueRef.current
      .then(() => consume({ ...progress, traceContext }))
      .catch(error => onError?.(generationServices.normalizeGameCardError(error)))
      .finally(() => end?.());
    return queueRef.current;
  }, [beginOperation, consume, onError]);
}

export { latestAssistantIndex, playbackMeta, updatePlayback };
export default useReadingStatePatches;
