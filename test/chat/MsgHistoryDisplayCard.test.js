import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';

async function openHistory(messages) {
  global.platformMock.getChatHistory.mockResolvedValue({ success: true, messages });
  await act(async () => { render(React.createElement(ChatPanel)); });
  fireEvent.mouseEnter(document.querySelector('.chat-header-hover-trigger'));
  await act(async () => { fireEvent.click(document.querySelector('.chat-header')); });
  expect(screen.getByText('msg历史记录')).toBeInTheDocument();
}

test('history preserves roles, content, thinking, TTL and metadata', async () => {
  const messages = [
    { role: 'system', content: 'temporary rules', ttl: 1, _meta: { visibility: 'llm_only' } },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!', _thinking: 'How to respond...' }
  ];
  await openHistory(messages);
  const { msgs } = JSON.parse(document.querySelector('[data-gc-part="message-history-content"]').textContent);
  // History exposes the public `thinking` field, normalizing stored `_thinking`.
  expect(Object.values(msgs).map(({ id: _id, ...msg }) => msg)).toEqual([
    messages[0], messages[1],
    { role: 'assistant', content: 'Hi there!', thinking: 'How to respond...' }
  ]);
});

test('empty history shows the empty state instead of a JSON card', async () => {
  await openHistory([]);
  expect(screen.getByText('暂无消息历史记录')).toBeInTheDocument();
  expect(document.querySelector('[data-gc-part="message-history-content"]')).toBeNull();
});

test('opening history shows the live Agent context instead of rereading a stale archive', async () => {
  const platform = global.platformMock;
  platform.getModelConfig.mockResolvedValue({ success: true,
    config: { apiUrl: 'https://api.example.com/v1', apiKey: 'key', modelName: 'model' } });
  platform.getChatHistory.mockResolvedValue({ success: true, messages: [] });
  global.fetch.mockResolvedValue(global.createStreamingMock('Current response'));
  await act(async () => { render(React.createElement(ChatPanel)); });
  fireEvent.change(screen.getByPlaceholderText('输入您的回答...'), { target: { value: 'Question' } });
  fireEvent.click(document.querySelector('button[type="submit"]'));
  await screen.findByText('Current response');

  const stored = [{ role: 'assistant', content: 'Stored response' }];
  platform.getChatHistory.mockResolvedValue({ success: true, messages: stored });
  fireEvent.mouseEnter(document.querySelector('.chat-header-hover-trigger'));
  await act(async () => { fireEvent.click(document.querySelector('.chat-header')); });
  const { msgs } = JSON.parse(document.querySelector('[data-gc-part="message-history-content"]').textContent);
  await waitFor(() => {
    const current = JSON.parse(document.querySelector('[data-gc-part="message-history-content"]').textContent).msgs;
    expect(current.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'Question' }, { role: 'assistant', content: 'Current response' }
    ]);
  });
  expect(msgs).not.toEqual(stored);
});

test('opening history does not reread storage or lose the loaded Agent context', async () => {
  await openHistory([{ role: 'assistant', content: 'Previous history' }]);
  await act(async () => { fireEvent.click(document.querySelector('.chat-header')); });
  global.platformMock.getChatHistory.mockResolvedValue({ success: false, error: 'Read error', messages: [] });
  await act(async () => { fireEvent.click(document.querySelector('.chat-header')); });
  expect(screen.queryByRole('alert')).toBeNull();
  const { msgs } = JSON.parse(document.querySelector('[data-gc-part="message-history-content"]').textContent);
  expect(msgs).toEqual([expect.objectContaining({ role: 'assistant', content: 'Previous history' })]);
});

test('an initial failed read leaves history empty and reports the error', async () => {
  global.platformMock.getChatHistory.mockResolvedValue({ success: false, error: 'Read error', messages: [] });
  await act(async () => { render(React.createElement(ChatPanel)); });
  await act(async () => { fireEvent.click(document.querySelector('.chat-header')); });
  expect(screen.getByText('暂无消息历史记录')).toBeInTheDocument();
  expect(screen.getAllByRole('alert').some(alert => alert.textContent.includes('Read error'))).toBe(true);
});
