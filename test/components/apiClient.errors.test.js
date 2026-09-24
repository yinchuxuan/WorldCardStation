const { sendChatRequest } = require('../../src/renderer/chat/apiClient.js');

test.each([
  [401, { error: { message: 'Invalid API key' } }, 'Invalid API key'],
  [500, {}, 'API 错误: 500']
])('reports OpenAI HTTP %s errors', async (status, body, expected) => {
  global.fetch.mockResolvedValue({ ok: false, status, json: async () => body });
  await expect(sendChatRequest({
    apiUrl: 'https://api.example.com/v1', apiKey: 'key', modelName: 'model',
    protocol: 'openai', messages: [{ role: 'user', content: 'Hi' }]
  }, { onToken: jest.fn() })).rejects.toThrow(expected);
});
