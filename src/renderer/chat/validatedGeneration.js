import { createMessageId } from './messageIds.js';
import { sendStreamedGeneration } from './streamGeneration.js';
import {
  responseValidationMaxRetries,
  validateResponse
} from '../../shared/game-card/validation/responseValidation.js';

function validationFeedback(violations) {
  const details = violations.map(item => (
    `- [${item.id}] ${item.message}\n  实际结果：${JSON.stringify(item.actual)}`
  )).join('\n');
  return {
    role: 'system',
    content: `上一份回复未通过输出契约，请修正后重新完整回答：\n${details}`,
    _meta: { source: 'response_validation_retry', visibility: 'llm_only' }
  };
}

function streamOptions(preSend, modelConfig, tw, abortSignal, options) {
  return {
    preSend,
    modelConfig,
    tw,
    abortSignal,
    traceContext: options.traceContext,
    observer: options.observer,
    onStreamContentStart: options.onStreamContentStart,
    onStreamPreviewState: options.onStreamPreviewState,
    onStatePatchApplied: options.onStatePatchApplied,
    onGameCardError: options.onGameCardError
  };
}

function validateAttempt(preSend, streamResult) {
  return validateResponse({
    config: preSend.card?.responseValidation,
    rawContent: streamResult.rawContent,
    stateBefore: preSend.state,
    stateAfter: streamResult.validationState || streamResult.state || preSend.state,
    updates: streamResult.validationUpdates || []
  });
}

async function restoreForValidationRetry(preSend, options, validation, retryCount) {
  options.setGameState?.(preSend.state);
  await options.onValidationRetry?.(preSend.state, { validation, retryCount });
}

async function generateValidatedResponse({
  preSend,
  modelConfig,
  tw,
  abortSignal,
  options,
  initialMessageId
}) {
  const maxRetries = responseValidationMaxRetries(preSend.card?.responseValidation);
  let retryCount = 0;
  let streamMessageId = initialMessageId;
  let requestPreSend = preSend;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let streamResult;
    try {
      streamResult = await sendStreamedGeneration(
        streamOptions(requestPreSend, modelConfig, tw, abortSignal, options)
      );
    } catch (error) {
      error.streamMessageId = streamMessageId;
      throw error;
    }
    const validation = validateAttempt(preSend, streamResult);
    options.observer?.('response.validation', { attempt, result: validation });
    const canRetry = validation.action === 'retry' && retryCount < maxRetries;
    if (!canRetry) {
      const exhausted = validation.action === 'retry';
      return {
        streamMessageId,
        streamResult: {
          ...streamResult,
          validation: exhausted
            ? { ...validation, action: 'warn', retryCount, retryExhausted: true }
            : { ...validation, retryCount }
        }
      };
    }

    retryCount += 1;
    options.observer?.('validation.rollback', { retryCount, status: 'rolled_back' }, preSend.messages, preSend.state);
    tw.reset();
    await restoreForValidationRetry(preSend, options, validation, retryCount);
    streamMessageId = createMessageId();
    tw.startStreaming(streamMessageId);
    options.setShowStreamThinking?.(true);
    requestPreSend = {
      ...preSend,
      messages: [...preSend.messages, validationFeedback(validation.violations)]
    };
  }
  throw Error('response validation attempts exhausted unexpectedly');
}

export { generateValidatedResponse, validationFeedback, validateAttempt };
