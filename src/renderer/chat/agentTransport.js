import { sendChatRequest } from './apiClient.js';
import { buildModelRequest } from './modelRequest.js';

// Only the host resolves credentials. Shared runtime and scripts see a model reference.
function createAgentTransport(resolveModel, send = sendChatRequest) {
  return async ({ model, messages, signal }, callbacks) => {
    const config = await resolveModel(model);
    if (!config?.apiUrl || !config?.apiKey || !config?.modelName) {
      throw new Error(`model configuration is incomplete: ${model}`);
    }
    if (signal.aborted) throw new Error('Agent call cancelled');
    return send(buildModelRequest(config, messages, signal), callbacks);
  };
}

export { createAgentTransport };
