import { createAgentTransport } from '../../src/renderer/chat/agentTransport.js';

test('host resolves exact model reference and uses existing streaming request boundary', async () => {
  const config = { apiUrl: 'https://model.example', apiKey: 'test-key', modelName: 'test-model', protocol: 'anthropic' };
  const resolve = jest.fn(async () => config);
  const send = jest.fn(async (_, cb) => { cb.onToken('raw'); cb.onThinkingToken('thinking'); });
  const transport = createAgentTransport(resolve, send);
  const signal = new AbortController().signal;
  const callbacks = { onToken: jest.fn(), onThinkingToken: jest.fn() };
  await transport({ model: 'narration-model', signal, messages: [
    { id: '1', role: 'system', content: 'prompt', ttl: 1 },
    { role: 'assistant', content: 'debug', _meta: { visibility: 'debug_only' } }
  ] }, callbacks);
  expect(resolve).toHaveBeenCalledWith('narration-model');
  expect(send).toHaveBeenCalledWith({ ...config, signal, messages: [{ role: 'system', content: 'prompt' }] }, callbacks);
  expect(callbacks.onToken).toHaveBeenCalledWith('raw');
  expect(callbacks.onThinkingToken).toHaveBeenCalledWith('thinking');
});

test('incomplete model reference does not fall back or send a request', async () => {
  const send = jest.fn();
  const transport = createAgentTransport(async () => null, send);
  await expect(transport({ model: 'missing', signal: new AbortController().signal }, {})).rejects.toThrow('missing');
  expect(send).not.toHaveBeenCalled();
});
