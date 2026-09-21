/**
 * Tests for Retry Button on Last User Message (app-001)
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

import ChatPanel from '../../src/renderer/ChatPanel.jsx';

const platformMock = global.platformMock;

describe('Retry Button - Visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-api-key', modelName: 'gpt-4' }
    });
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: [] });
    global.fetch = jest.fn().mockResolvedValue(global.createStreamingMock('Retry response'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should NOT show retry button when there are no messages', async () => {
    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });
    expect(screen.queryByRole('button', { name: '重新生成回复' })).not.toBeInTheDocument();
  });

  test('should show retry button for the last user message', async () => {
    platformMock.getChatHistory.mockResolvedValue({
      success: true,
      messages: [{ role: 'user', content: 'Hello' }]
    });
    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });
    const button = screen.getByRole('button', { name: '重新生成回复' });
    expect(button).toHaveAttribute('title', '重新生成');
    expect(button.querySelector('.material-icons')).toHaveTextContent('refresh');
  });

  test('should show retry button on last user message only', async () => {
    const savedMessages = [
      { role: 'user', content: 'Question 1' },
      { role: 'assistant', content: 'Answer 1', _thinking: 'thinking 1' },
      { role: 'user', content: 'Question 2' },
      { role: 'assistant', content: 'Answer 2', _thinking: 'thinking 2' }
    ];
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: savedMessages });

    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });

    const retryBtns = screen.queryAllByRole('button', { name: '重新生成回复' });
    expect(retryBtns.length).toBe(1);

    const btn = retryBtns[0];
    const row = btn.closest('.chat-message-row');
    expect(row).toBeTruthy();
    expect(row.querySelector('.chat-message.user')).toBeTruthy();
  });

  test('should show retry button when the latest assistant message has no _thinking', async () => {
    const savedMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' }
    ];
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: savedMessages });

    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });

    const retryBtns = screen.queryAllByRole('button', { name: '重新生成回复' });
    expect(retryBtns.length).toBe(1);
    expect(retryBtns[0].closest('.chat-message-row').querySelector('.chat-message.user')).toBeTruthy();
  });

  test('should show retry button when the latest assistant message has _thinking', async () => {
    const savedMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there', _thinking: 'How to respond' }
    ];
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: savedMessages });

    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });

    const retryBtns = screen.queryAllByRole('button', { name: '重新生成回复' });
    expect(retryBtns.length).toBe(1);
  });
});

describe('Retry Button - Click Behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-api-key', modelName: 'gpt-4' }
    });
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: [] });
    global.fetch = jest.fn().mockResolvedValue(global.createStreamingMock('New regenerated response'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should retry by clearing messages and resending up to last user message', async () => {
    const savedMessages = [
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Old answer', _thinking: 'old thinking' }
    ];
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: savedMessages });

    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });

    const retryBtn = screen.queryByRole('button', { name: '重新生成回复' });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });

    // fetch should have been called for the retry request
    expect(global.fetch).toHaveBeenCalled();
  });

  test('should NOT retry when loading/in progress', async () => {
    const savedMessages = [
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer', _thinking: 'thinking' }
    ];
    platformMock.getChatHistory.mockResolvedValue({ success: true, messages: savedMessages });

    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(100); });

    const retryBtn = screen.queryByRole('button', { name: '重新生成回复' });
    expect(retryBtn).toBeInTheDocument();
    global.fetch.mockImplementation(() => new Promise(() => {}));
    await act(async () => { fireEvent.click(retryBtn); });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '重新生成回复' })).not.toBeInTheDocument();
  });
});
