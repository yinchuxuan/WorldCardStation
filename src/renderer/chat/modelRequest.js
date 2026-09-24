import { adaptMessagesToProtocol } from '../../shared/game-card/protocol/protocolAdapter.js';

const normalizeMessages = messages => adaptMessagesToProtocol(messages, 'openai').messages;

function buildModelRequest(config, messages, signal) {
  return { ...config, protocol: config.protocol || 'openai', signal, messages: normalizeMessages(messages) };
}

export { buildModelRequest };
