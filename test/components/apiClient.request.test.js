/**
 * Tests for apiClient - sendChatRequest with OpenAI protocol
 */
const { sendChatRequest } = require('../../src/renderer/chat/apiClient.js');

describe('sendChatRequest - OpenAI protocol', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue(global.createStreamingMock('Hello from OpenAI'));
  });

  test.each(['openai', undefined])('uses OpenAI endpoint and headers for protocol %s', async (protocol) => {
    const onToken = jest.fn();
    const onThinkingToken = jest.fn();

    await sendChatRequest(
      {
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        modelName: 'gpt-4',
        protocol,
        messages: [{ role: 'user', content: 'Hello' }]
      },
      { onToken, onThinkingToken }
    );

    expect(global.fetch).toHaveBeenCalled();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers['authorization']).toBe('Bearer sk-test-key');
    expect(options.headers['content-type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('gpt-4');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(body.stream).toBe(true);
  });

  test('should use default model when not specified', async () => {
    global.fetch.mockResolvedValue(global.createStreamingMock('Response'));
    const onToken = jest.fn();

    await sendChatRequest(
      {
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        modelName: '',
        messages: [{ role: 'user', content: 'Hi' }]
      },
      { onToken }
    );

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.model).toBe('gpt-3.5-turbo');
    expect(body.max_tokens).toBe(50000);
    expect(body.temperature).toBe(1);
    expect(body.top_p).toBe(1);
    expect(body.frequency_penalty).toBe(0);
    expect(body.presence_penalty).toBe(0);
    expect(body.reasoning_effort).toBeUndefined();
  });

  test('should include supported OpenAI generation parameters only', async () => {
    global.fetch.mockResolvedValue(global.createStreamingMock('Response'));

    await sendChatRequest(
      {
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        modelName: 'gpt-4',
        maxTokens: '2048',
        temperature: '0.8',
        topP: '0.9',
        frequencyPenalty: '0.2',
        presencePenalty: '0.4',
        reasoningEffort: 'high',
        topK: '40',
        messages: [{ role: 'user', content: 'Hi' }]
      },
      { onToken: jest.fn() }
    );

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.8);
    expect(body.top_p).toBe(0.9);
    expect(body.frequency_penalty).toBe(0.2);
    expect(body.presence_penalty).toBe(0.4);
    expect(body.reasoning_effort).toBe('high');
    expect(body.top_k).toBeUndefined();
  });

  test('should run native requests with a cancellable signal', async () => {
    const controller = new AbortController();
    await sendChatRequest(
      {
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        modelName: 'gpt-4',
        signal: controller.signal,
        messages: [{ role: 'user', content: 'Hi' }]
      },
      { onToken: jest.fn() }
    );

    const [, options] = global.fetch.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
