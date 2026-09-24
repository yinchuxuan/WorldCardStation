import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';

const platform = global.platformMock;
beforeEach(() => {
  jest.clearAllMocks();
  platform.getModelConfig.mockResolvedValue({
    success: true, config: { apiUrl: 'https://api.example.com/v1', apiKey: 'key', modelName: 'model' }
  });
  global.fetch.mockResolvedValue(global.createStreamingMock('New answer'));
});

async function mount(messages) {
  platform.getChatHistory.mockResolvedValue({ success: true, messages });
  await act(async () => { render(React.createElement(ChatPanel)); });
}

test('has no retry action without messages', async () => {
  await mount([]);
  expect(screen.queryByRole('button', { name: '重新生成回复' })).not.toBeInTheDocument();
});

test.each([
  ['no answer', []],
  ['plain answer', [{ role: 'assistant', content: 'Old answer' }]],
  ['thinking answer', [{ role: 'assistant', content: 'Old answer', _thinking: 'Old reasoning' }]]
])('retries only the latest user turn with %s', async (_label, tail) => {
  const prefix = [
    { role: 'user', content: 'Question 1' },
    { role: 'assistant', content: 'Answer 1' },
    { role: 'user', content: 'Question 2' }
  ];
  await mount([...prefix, ...tail]);
  const buttons = screen.getAllByRole('button', { name: '重新生成回复' });
  expect(buttons).toHaveLength(1);
  expect(buttons[0].closest('.chat-message-row')).toHaveTextContent('Question 2');

  fireEvent.click(buttons[0]);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).messages).toEqual(prefix);
  await screen.findByText('New answer');
  expect(screen.queryByText('Old answer')).not.toBeInTheDocument();
});

test('hides retry while a request is active and restores it when completed', async () => {
  await mount([{ role: 'user', content: 'Question' }]);
  let finish;
  global.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: '重新生成回复' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button', { name: '重新生成回复' })).not.toBeInTheDocument();
  await act(async () => { finish(global.createStreamingMock('Completed answer')); });
  await screen.findByText('Completed answer');
  expect(await screen.findByRole('button', { name: '重新生成回复' })).toBeInTheDocument();
});
