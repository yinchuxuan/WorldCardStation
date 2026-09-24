/**
 * Tests for ChatPanel Component - Error Handling
 */

const _React = require('react');
const { render: _render, screen: _screen, fireEvent: _fireEvent, waitFor: _waitFor, act } = require('@testing-library/react');

const platformMock = global.platformMock;

describe('ChatPanel Component - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-key', modelName: 'gpt-4' }
    });
  });

  test('should show config error when submitting without model', async () => {
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: '', apiKey: '', modelName: '' }
    });

    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const input = await _screen.findByPlaceholderText('输入您的回答...');
    await _waitFor(() => expect(input).not.toBeDisabled());
    _fireEvent.change(input, { target: { value: 'test question' } });

    await act(async () => { await Promise.resolve(); });

    const form = document.querySelector('.chat-input-area');
    _fireEvent.submit(form);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const notice = await _screen.findByRole('alert');
    expect(notice).toHaveTextContent('请先在右侧设置面板配置模型 API');
    expect(notice.parentElement).toBe(document.body);
    expect(document.querySelector('.chat-message.assistant')).toBeNull();
    _fireEvent.click(_screen.getByRole('button', { name: '关闭请求错误' }));
    expect(_screen.queryByRole('alert')).toBeNull();
  });

  test('should handle API error and show error message', async () => {
    const originalConsoleError = console.error;
    console.error = jest.fn();

    global.fetch.mockRejectedValue(new Error('Network failed'));

    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const input = await _screen.findByPlaceholderText('输入您的回答...');
    await _waitFor(() => expect(input).not.toBeDisabled());
    _fireEvent.change(input, { target: { value: 'test' } });

    await act(async () => { await Promise.resolve(); });

    const form = document.querySelector('.chat-input-area');
    _fireEvent.submit(form);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const notice = await _screen.findByRole('alert');
    expect(notice).toHaveTextContent('Network failed');
    expect(notice.parentElement).toBe(document.body);
    expect(document.querySelector('.chat-message.assistant')).toBeNull();

    console.error = originalConsoleError;
  });

  test('should handle API response error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Forbidden' } })
    });

    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const input = await _screen.findByPlaceholderText('输入您的回答...');
    await _waitFor(() => expect(input).not.toBeDisabled());
    _fireEvent.change(input, { target: { value: 'test' } });

    await act(async () => { await Promise.resolve(); });

    const form = document.querySelector('.chat-input-area');
    _fireEvent.submit(form);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(await _screen.findByRole('alert')).toHaveTextContent('Forbidden');
  });

  test('should display response on successful API call', async () => {
    global.fetch.mockResolvedValue(global.createStreamingMock('Hello World'));

    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const input = await _screen.findByPlaceholderText('输入您的回答...');
    await _waitFor(() => expect(input).not.toBeDisabled());
    _fireEvent.change(input, { target: { value: 'hi' } });

    await act(async () => { await Promise.resolve(); });

    const form = document.querySelector('.chat-input-area');
    _fireEvent.submit(form);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(await _screen.findByText('Hello World')).toBeInTheDocument();
  });

  test('should use default model name when not provided', async () => {
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com', apiKey: 'key', modelName: '' }
    });

    global.fetch.mockResolvedValue(global.createStreamingMock('response'));

    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    await _waitFor(() => {
      expect(_screen.getByText('已连接')).toBeInTheDocument();
    }, { timeout: 10000 });

    const input = await _screen.findByPlaceholderText('输入您的回答...');
    await _waitFor(() => expect(input).not.toBeDisabled());
    _fireEvent.change(input, { target: { value: 'test' } });
    _fireEvent.submit(input.closest('form'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    await _waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
      const call = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('gpt-3.5-turbo');
    }, { timeout: 10000 });
  });
});
