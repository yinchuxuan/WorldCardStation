import { sendChatRequest } from './apiClient.js';
import { normalizeGameCardError } from '../gameCard/runtimeError.js';
import {
  prepareAfterResponseMessages,
  prepareAfterStreamMessages,
  prepareInitMessages,
  preparePreSendMessages
} from '../gameCard/sendPipeline.js';
import {
  prepareStatePatchAtCursor
} from '../gameCard/statePatchPipeline.js';
import { gameCardPlatform } from '../platform/index.js';
import { tracePipeline } from '../trace/tracePipeline.js';

const generationServices = {
  normalizeGameCardError,
  prepareAfterResponseMessages: tracePipeline(prepareAfterResponseMessages, 'after_response', gameCardPlatform),
  prepareAfterStreamMessages: tracePipeline(prepareAfterStreamMessages, 'after_stream', gameCardPlatform),
  prepareInitMessages: tracePipeline(prepareInitMessages, 'init', gameCardPlatform),
  preparePreSendMessages: tracePipeline(preparePreSendMessages, 'pre_send', gameCardPlatform),
  prepareStatePatchAtCursor: tracePipeline(prepareStatePatchAtCursor, 'state_patch', gameCardPlatform),
  sendChatRequest
};

export default generationServices;
