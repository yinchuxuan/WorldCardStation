/**
 * Tests for ChatPanel Chat History Persistence
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';

const platformMock = global.platformMock;

describe('ChatPanel Chat History Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-api-key', modelName: 'gpt-4' }
    });
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: [] });
    platformMock.saveChatHistory.mockResolvedValue({ success: true });
    global.fetch = jest.fn().mockResolvedValue(global.createStreamingMock('Test response'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should load chat history from file on mount', async () => {
    const savedMessages = [
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: 'Previous answer' }
    ];
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: savedMessages });

    render(React.createElement(ChatPanel));

    await act(async () => {
      await Promise.resolve();
    });

    expect(platformMock.getChatHistory).toHaveBeenCalled();
    // Messages should be loaded from history
    expect(await screen.findByText('Previous question')).toBeInTheDocument();
    expect(await screen.findByText('Previous answer')).toBeInTheDocument();
  });

  test('should handle empty chat history on mount', async () => {
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: [] });

    render(React.createElement(ChatPanel));

    await act(async () => {
      await Promise.resolve();
    });

    expect(platformMock.getChatHistory).toHaveBeenCalled();
    expect(await screen.findByText('开始对话')).toBeInTheDocument();
  });

  test('should save chat history after model response completes', async () => {
    render(React.createElement(ChatPanel));

    await act(async () => {
      await Promise.resolve();
    });

    // Clear save calls from initial load
    platformMock.saveChatHistory.mockClear();

    // Send a message
    const input = await screen.findByPlaceholderText('输入您的回答...');
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: 'Hello' } });

    await act(async () => {
      await Promise.resolve();
    });

    const sendBtn = document.querySelector('button[type="submit"]');
    fireEvent.click(sendBtn);

    await act(async () => {
    });

    await waitFor(() => expect(platformMock.saveChatHistory.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello' }),
      expect.objectContaining({ role: 'assistant', content: 'Test response' })
    ]));
  });


  test('should handle getChatHistory failure gracefully', async () => {
    platformMock.getChatHistory.mockResolvedValue({ success: false, error: 'Read error', messages: [] });

    render(React.createElement(ChatPanel));

    await act(async () => {
      await Promise.resolve();
    });

    expect(platformMock.getChatHistory).toHaveBeenCalled();
    // Should still render empty state
    expect(await screen.findByText('开始对话')).toBeInTheDocument();
  });

  test('should handle saveChatHistory failure gracefully', async () => {
    platformMock.saveChatHistory.mockResolvedValue({ success: false, error: 'Save error' });

    render(React.createElement(ChatPanel));

    await act(async () => {
      await Promise.resolve();
    });

    // Send a message - should not crash even if save fails
    const input = await screen.findByPlaceholderText('输入您的回答...');
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: 'Hello' } });

    await act(async () => {
      await Promise.resolve();
    });

    const sendBtn = document.querySelector('button[type="submit"]');
    fireEvent.click(sendBtn);

    await act(async () => {
    });

    // Should have attempted to save
    expect(platformMock.saveChatHistory).toHaveBeenCalled();
    // Response should still be displayed
    expect(await screen.findByText('Test response')).toBeInTheDocument();
  });
});
