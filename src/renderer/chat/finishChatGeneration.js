import generationServices from './generationServices.js';
import { createChatMessage } from './messageIds.js';

function hasAfterStreamRule(card) {
  return card?.rules?.some(rule => rule?.when?.phase === 'after_stream') === true;
}

function validationWarning(validation) {
  if (validation?.action !== 'warn' || !validation.violations?.length) return null;
  return {
    retryCount: validation.retryCount || 0,
    retryExhausted: validation.retryExhausted === true,
    violations: validation.violations.map(({ id, message, onFailure, actual }) => ({
      id, message, onFailure, actual
    }))
  };
}

function withValidationWarning(message, warning) {
  if (!warning) return message;
  return {
    ...message,
    _meta: { ...message._meta, responseValidation: warning }
  };
}

function attachValidationWarning(messages, messageId, warning) {
  if (!warning) return messages;
  return messages.map(message => (
    message.id === messageId ? withValidationWarning(message, warning) : message
  ));
}

async function applyAfterStream(messages, state, card, options) {
  if (!hasAfterStreamRule(card)) {
    return { messages, state, applied: false, card };
  }
  const result = await generationServices.prepareAfterStreamMessages({ messages, state, card, traceContext: options.traceContext });
  if (result.error) options.onGameCardError?.(generationServices.normalizeGameCardError(result));
  await options.onPresentationEffects?.(result.presentationEffects, {
    card: result.card || card,
    phase: 'after_stream',
    state: result.state
  });
  return {
    ...result,
    messages: result.applied ? result.messages : messages,
    state: result.state || state
  };
}

async function finishChatGeneration(preSend, baseMessages, baseState, options, streamResult = {},
  streamMessageId) {
  const { setMessages, setGameState, setIsLoading, tw } = options;
  tw.finishStreaming();
  const content = tw.getRawContent?.() || streamResult.rawContent || tw.getAccumulatedContent();
  const warning = validationWarning(streamResult.validation);
  if (!content && !warning) {
    setIsLoading(false);
    tw.clearStreaming();
    return true;
  }
  const segmented = preSend.card?.display?.segmentedReading === true;
  const assistantMessage = createChatMessage({
    id: streamMessageId,
    role: 'assistant',
    content,
    _thinking: tw.getThinkingContent(),
    thinking: tw.getThinkingContent(),
    _meta: {
      statePatchPlayback: {
        afterResponseApplied: !segmented,
        appliedPatchCount: streamResult.appliedPatchCount || 0
      }
    }
  });
  const base = preSend.applied ? preSend.messages : baseMessages;
  const streamedState = streamResult.state || preSend.state || baseState;
  options.observer?.('assistant.accepted', {}, [...base, assistantMessage], streamedState);
  const streamed = await applyAfterStream(
    [...base, assistantMessage], streamedState, preSend.card, options
  );
  const streamedMessages = attachValidationWarning(
    streamed.messages, streamMessageId, warning
  );
  const acceptedAssistant = withValidationWarning(assistantMessage, warning);
  if (segmented) {
    options.observer?.('generation.commit', { status: 'awaiting_reading' }, streamedMessages, streamed.state);
    if (streamed.applied) {
      setGameState?.(streamed.state);
      setMessages(streamedMessages);
    } else if (options.appendAssistantWithUpdater) {
      setMessages(previous => [...previous, acceptedAssistant]);
    } else setMessages(streamedMessages);
    options.onResponseValidationWarning?.(warning);
    setIsLoading(false);
    tw.clearStreaming();
    return true;
  }
  const after = await generationServices.prepareAfterResponseMessages({
    messages: streamedMessages,
    state: streamed.state,
    card: streamed.card || preSend.card || null,
    traceContext: options.traceContext,
    statePatchesApplied: true
  });
  if (after.state && setGameState) setGameState(after.state);
  await options.onPresentationEffects?.(after.presentationEffects, {
    card: after.card || preSend.card,
    phase: 'after_response',
    state: after.state
  });
  const afterMessages = attachValidationWarning(after.messages, streamMessageId, warning);
  options.observer?.('generation.commit', { status: 'committed' }, after.applied ? afterMessages : streamedMessages, after.state || streamed.state);
  if (after.applied) setMessages(afterMessages);
  else if (options.appendAssistantWithUpdater) {
    setMessages(previous => [...previous, acceptedAssistant]);
  } else setMessages(streamedMessages);
  options.onResponseValidationWarning?.(warning);
  setIsLoading(false);
  tw.clearStreaming();
  return true;
}

export {
  applyAfterStream,
  attachValidationWarning,
  finishChatGeneration,
  hasAfterStreamRule,
  validationWarning
};
