import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';
import generationServices from '../../src/renderer/chat/generationServices.js';

const originalSend = generationServices.sendChatRequest;
beforeEach(() => {
  global.platformMock.getModelConfig.mockResolvedValue({ success: true,
    config: { apiUrl: 'https://api.example.com/v1', apiKey: 'key', modelName: 'model' } });
  global.platformMock.getChatHistory.mockResolvedValue({ success: true, messages: [] });
});
afterEach(() => { generationServices.sendChatRequest = originalSend; });

test('pins a new turn to the top but preserves the reading position when its stream ends', async () => {
  let finish;
  generationServices.sendChatRequest = jest.fn(async (_payload, callbacks) => {
    callbacks.onToken('Streaming answer');
    await new Promise(resolve => { finish = resolve; });
  });
  await act(async () => { render(<ChatPanel />); });
  const history = document.querySelector('[data-gc-part="chat-history"]');
  history.scrollTop = 200;
  fireEvent.change(screen.getByPlaceholderText('输入您的回答...'), { target: { value: 'Question' } });
  fireEvent.submit(document.querySelector('form[data-gc-part="chat-input"]'));
  await waitFor(() => expect(history.querySelector('.collapsed-message-view')).toBeInTheDocument());
  const view = history.querySelector('.collapsed-message-view');
  expect(history.scrollTop).toBe(0);
  expect(view.scrollTop).toBe(0);
  view.scrollTop = 123;
  await act(async () => { finish(); });
  await waitFor(() => expect(history.querySelector('.streaming-message-row')).toBeNull());
  expect(history.querySelector('.collapsed-message-view').scrollTop).toBe(123);
});

test('scrolls to the end when opening message history', async () => {
  global.platformMock.getChatHistory.mockResolvedValue({ success: true,
    messages: [{ role: 'user', content: 'Stored question' }] });
  await act(async () => { render(<ChatPanel />); });
  const history = document.querySelector('[data-gc-part="chat-history"]');
  // jsdom has no layout; scope the dimension fixture to this element, not the prototype.
  Object.defineProperty(history, 'scrollHeight', { configurable: true, value: 500 });
  history.scrollTop = 25;
  fireEvent.mouseEnter(document.querySelector('.chat-header-hover-trigger'));
  await act(async () => { fireEvent.click(document.querySelector('.chat-header')); });
  expect(screen.getByText('msg历史记录')).toBeInTheDocument();
  expect(history.scrollTop).toBe(history.scrollHeight);
});
