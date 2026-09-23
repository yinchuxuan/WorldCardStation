import { sendChatRequest } from './apiClient.js';
import { adaptMessagesToProtocol } from '../../shared/game-card/protocol/protocolAdapter.js';

// Only the host resolves credentials. Shared runtime and scripts see a model reference.
function createAgentTransport(resolveModel, send = sendChatRequest) {
  return async ({ model, messages, signal }, callbacks) => {
    const config = await resolveModel(model);
    if (!config?.apiUrl || !config?.apiKey || !config?.modelName) {
      throw new Error(`model configuration is incomplete: ${model}`);
    }
    if (signal.aborted) throw new Error('Agent call cancelled');
    return send({ ...config, signal,
      messages: adaptMessagesToProtocol(messages, 'openai').messages }, callbacks);
  };
}

export { createAgentTransport };
