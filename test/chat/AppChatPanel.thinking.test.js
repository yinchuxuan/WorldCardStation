/**
 * Tests for ChatPanel thinking process display
 */

const React = require('react');
const { render, screen, fireEvent, waitFor, act } = require('@testing-library/react');

const platformMock = global.platformMock;
const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;
const generationServices = require('../../src/renderer/chat/apiClient.js');
const originalSendChatRequest = generationServices.sendChatRequest;

describe('ChatPanel thinking display', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-api-key', modelName: 'gpt-4' }
    });
  });

  afterEach(() => {
    generationServices.sendChatRequest = originalSendChatRequest;
  });
  test('thinking content should be stored in last assistant message', async () => {
    global.fetch.mockResolvedValue(
      global.createThinkingStreamingMock('Thinking process here', 'The final answer.')
    );

    render(React.createElement(ChatPanel));

    await act(async () => {
      await Promise.resolve();
    });

    const input = await screen.findByPlaceholderText('输入您的回答...');
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(document.querySelector('button[type="submit"]'));

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('The final answer.')).toBeInTheDocument());
    await waitFor(() => {
      const saved = platformMock.saveChatHistory.mock.calls.at(-1)?.[1]?.runtimeSession?.current.contexts.chat.messages;
      expect(saved?.at(-1)).toMatchObject({
        role: 'assistant', content: 'The final answer.', thinking: 'Thinking process here'
      });
    });
  });
  test('streaming thinking can be reopened by clicking streamed answer text', async () => {
    let callbacks;
    let finishRequest;
    generationServices.sendChatRequest = jest.fn((_config, cbs) => {
      callbacks = cbs;
      return new Promise(resolve => { finishRequest = resolve; });
    });

    render(React.createElement(ChatPanel));

    await act(async () => {
      await Promise.resolve();
    });

    const input = await screen.findByPlaceholderText('输入您的回答...');
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(document.querySelector('button[type="submit"]'));

    await waitFor(() => {
      expect(generationServices.sendChatRequest).toHaveBeenCalled();
    });

    await act(async () => {
      callbacks.onThinkingToken('thinking while streaming');
      callbacks.onToken('answer text');
    });

    await screen.findByText('thinking while streaming');
    fireEvent.click(document.querySelector('.streaming-message-row .chat-message-bubble'));
    expect(screen.queryByText('thinking while streaming')).toBeNull();

    await act(async () => {
    });

    fireEvent.click(document.querySelector('.streaming-message-row .chat-message-bubble'));
    expect(screen.getByText('thinking while streaming')).toBeInTheDocument();

    await act(async () => {
      finishRequest();
      await Promise.resolve();
    });
  });
});
