import { createAgentTransport } from '../../src/renderer/chat/agentTransport.js';

test('Agent transport preserves system prompts and adapts Anthropic fields without metadata', async () => {
  global.fetch.mockResolvedValue(global.createAnthropicStreamingMock('ok'));
  const generate = createAgentTransport(async () => ({ apiUrl: 'https://proxy.example.com/anthropic',
    apiKey: 'key', modelName: 'claude', protocol: 'anthropic' }));
  const onToken = jest.fn();
  await generate({ model: 'default', signal: new AbortController().signal, messages: [
    { id: 'system', role: 'system', content: 'rules', ttl: 1 }, { role: 'user', content: 'Hi' }
  ] }, { onToken });
  const body = JSON.parse(global.fetch.mock.calls.at(-1)[1].body);
  expect(body.system).toBe('rules');
  expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  expect(onToken).toHaveBeenCalled();
});
