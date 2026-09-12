import generationServices from './generationServices.js';
import { createStatePatchStreamParser } from './statePatchStream.js';

function requestOptions(modelConfig, messages, abortSignal) {
  return {
    apiUrl: modelConfig.apiUrl,
    apiKey: modelConfig.apiKey,
    modelName: modelConfig.modelName,
    protocol: modelConfig.protocol || 'openai',
    maxTokens: modelConfig.maxTokens,
    temperature: modelConfig.temperature,
    topP: modelConfig.topP,
    frequencyPenalty: modelConfig.frequencyPenalty,
    presencePenalty: modelConfig.presencePenalty,
    reasoningEffort: modelConfig.reasoningEffort,
    signal: abortSignal,
    messages: generationServices.toGameCardApiMessages(messages)
  };
}

async function applyPatch(patchText, state, preSend, options, publish = true) {
  const result = await generationServices.prepareStatePatchAtCursor({
    patchText,
    messages: preSend.messages,
    state,
    card: preSend.card,
    traceContext: options.traceContext,
    traceDetails: options.traceDetails
  });
  if (result.error) {
    options.onGameCardError?.(generationServices.normalizeGameCardError(result));
    return { state, result };
  }
  if (result.applied && publish) {
    options.onStreamPreviewState?.(result.state);
    options.onStatePatchApplied?.(result);
  }
  return { state: result.applied ? result.state : state, result };
}

async function sendStreamedGeneration({
  preSend,
  modelConfig,
  tw,
  abortSignal,
  onStreamContentStart,
  onStreamPreviewState,
  onStatePatchApplied,
  onGameCardError,
  traceContext,
  observer
}) {
  const parser = createStatePatchStreamParser();
  const segmented = preSend.card?.display?.segmentedReading === true;
  const validationEnabled = Boolean(preSend.card?.responseValidation?.rules?.length);
  let contentStarted = false;
  let latestState = preSend.state;
  let validationState = preSend.state;
  let validationUpdates = [];
  let patchCount = 0;
  let rawContent = '';
  let tokenQueue = Promise.resolve();
  const options = { onGameCardError, onStatePatchApplied, onStreamPreviewState, traceContext };
  const notifyContentStart = () => {
    if (contentStarted) return;
    contentStarted = true;
    onStreamContentStart?.({ card: preSend.card, state: latestState });
  };
  const processEvents = async (events) => {
    for (const event of events) {
      if (event.type === 'patch') {
        rawContent += event.block;
        tw.pushProtocolContent?.(event.block);
        patchCount += 1;
        if (!segmented || !contentStarted) {
          const applied = await applyPatch(event.text, latestState, preSend,
            { ...options, traceDetails: { origin: 'stream', patchOrdinal: patchCount - 1 } });
          latestState = applied.state;
          validationState = latestState;
          validationUpdates = [
            ...validationUpdates,
            ...(applied.result.trace?.updates || [])
          ];
          tw.markPatchApplied?.(patchCount);
        } else if (validationEnabled) {
          const candidate = await applyPatch(
            event.text, validationState, preSend, { traceContext: { begin: () => null } }, false
          );
          validationState = candidate.state;
          validationUpdates = [
            ...validationUpdates,
            ...(candidate.result.trace?.updates || [])
          ];
        }
        continue;
      }
      rawContent += event.text;
      if (tw.pushContent(event.text) && event.text.trim()) notifyContentStart();
    }
  };
  const enqueueToken = text => {
    tokenQueue = tokenQueue.then(() => processEvents(parser.push(text)));
    return tokenQueue;
  };

  let requestError = null;
  const request = requestOptions(modelConfig, preSend.messages, abortSignal);
  observer?.('model.request', { messages: request.messages, protocol: request.protocol, representation: 'normalized_messages' });
  try {
    await generationServices.sendChatRequest(
      request,
      {
        onToken: enqueueToken,
        onThinkingToken: text => tw.pushContent(text, 'reasoning')
      }
    );
  } catch (error) {
    requestError = error;
  }
  try {
    await tokenQueue;
  } catch (error) {
    if (!requestError) throw error;
  }
  if (requestError) {
    observer?.('model.response', { status: 'partial', content: rawContent, thinking: tw.getThinkingContent?.() }, undefined, latestState);
    requestError.streamResult = {
      appliedPatchCount: tw.getAppliedPatchCount?.() || 0,
      rawContent,
      state: latestState
    };
    throw requestError;
  }
  await processEvents(parser.finish());
  observer?.('model.response', { status: 'received', content: rawContent, thinking: tw.getThinkingContent?.(),
    validationCandidate: validationEnabled && segmented ? { state: validationState, updates: validationUpdates } : undefined }, undefined, latestState);
  return {
    appliedPatchCount: tw.getAppliedPatchCount?.() || 0,
    rawContent: tw.getRawContent?.() || rawContent,
    state: latestState,
    validationState,
    validationUpdates
  };
}

export { sendStreamedGeneration };
