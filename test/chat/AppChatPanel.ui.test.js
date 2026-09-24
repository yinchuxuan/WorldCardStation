/**
 * Tests for ChatPanel Component - UI Tests
 */

const _React = require('react');
const { render: _render, screen: _screen, fireEvent: _fireEvent, waitFor: _waitFor, act } = require('@testing-library/react');

const platformMock = global.platformMock;

describe('ChatPanel Component - UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-api-key', modelName: 'gpt-4' }
    });
    global.fetch.mockResolvedValue(global.createStreamingMock('Test response'));
  });

  test('should show model name when configured', async () => {
    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => { await Promise.resolve(); });

    await _waitFor(() => {
      expect(_screen.getByText('gpt-4')).toBeInTheDocument();
    });
  });

  test('should show "已连接" when model name is empty but config exists', async () => {
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com', apiKey: 'key', modelName: '' }
    });

    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => { await Promise.resolve(); });

    await _waitFor(() => {
      expect(_screen.getByText('已连接')).toBeInTheDocument();
    });
  });

  test('enables nonblank input and rejects empty or whitespace-only submissions', async () => {
    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => { await Promise.resolve(); });

    const submitBtn = document.querySelector('button[type="submit"]');
    expect(submitBtn.disabled).toBe(true);
    expect(document.querySelector('[data-gc-part="chat-panel"]')).toBeTruthy();
    expect(document.querySelector('[data-gc-part="chat-history"]')).toBeTruthy();
    expect(document.querySelector('form[data-gc-part="chat-input"]')).toBeTruthy();
    expect(document.querySelector('textarea[data-gc-part="chat-input-textarea"]')).toBeTruthy();
    expect(submitBtn.dataset.gcPart).toBe('chat-send-button');
    const input = _screen.getByPlaceholderText('输入您的回答...');
    _fireEvent.change(input, { target: { value: 'some text' } });
    expect(submitBtn).toBeEnabled();
    for (const value of ['   ', '']) {
      _fireEvent.change(input, { target: { value } });
      expect(submitBtn).toBeDisabled();
      await act(async () => { _fireEvent.submit(input.closest('form')); });
      expect(global.fetch).not.toHaveBeenCalled();
    }
  });

  test('should handle failed config load', async () => {
    platformMock.getModelConfig.mockResolvedValue({
      success: false,
      error: 'Config load failed'
    });

    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => { await Promise.resolve(); });

    expect(_screen.queryByText('gpt-4')).not.toBeInTheDocument();
  });
});
