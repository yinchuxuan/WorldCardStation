import generationServices from './generationServices.js';
import { createStatePatchStreamParser } from './statePatchStream.js';
import { buildModelRequest } from './modelRequest.js';

async function applyPatch(patchText, state, preSend, options) {
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
  if (result.applied) {
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
  let contentStarted = false;
  let latestState = preSend.state;
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

        const applied = await applyPatch(event.text, latestState, preSend,
          { ...options, traceDetails: { origin: 'stream', patchOrdinal: patchCount - 1 } });
        latestState = applied.state;
        validationUpdates = [
          ...validationUpdates,
          ...(applied.result.trace?.updates || [])
        ];
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
  const request = buildModelRequest(modelConfig, preSend.messages, abortSignal);
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
      rawContent,
      state: latestState
    };
    throw requestError;
  }
  await processEvents(parser.finish());
  observer?.('model.response', { status: 'received', content: rawContent, thinking: tw.getThinkingContent?.() }, undefined, latestState);
  return {
    rawContent: tw.getRawContent?.() || rawContent,
    state: latestState,
    validationUpdates
  };
}

export { sendStreamedGeneration };
