import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import ChatRuntime from '../../src/renderer/chat/ChatRuntime.jsx';
import { GameCardRuntimeProvider } from '../../src/renderer/chat/GameCardRuntimeProvider.jsx';

function session(contents) {
  const view = { state: {}, records: [], reading: null, contexts: Object.fromEntries(Object.entries(contents)
    .map(([id, text]) => [id, { initialized: Boolean(text), messages: text ? [{ id: `${id}-1`, role: 'assistant', content: text }] : [] }])) };
  return { view: () => view, snapshot: () => view, running: false, subscribe: () => () => {},
    dispose: jest.fn(async () => {}), cancel: jest.fn(), send: jest.fn(), advance: jest.fn() };
}
test('shared history page selects actual Agent messages, includes empty agents and isolates Sessions', async () => {
  const first = session({ judge: 'private judgment', narrator: 'post_response final', unused: '' });
  const second = session({ guide: 'new Session only' });
  const tree = main => <GameCardRuntimeProvider mainSession={main}><ChatRuntime /></GameCardRuntimeProvider>;
  let rendered;
  await act(async () => { rendered = render(tree(first)); });
  fireEvent.click(document.querySelector('.chat-header'));
  expect(screen.getByText(/private judgment/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'narrator' }));
  expect(screen.getByText(/post_response final/)).toBeTruthy();
  expect(screen.queryByText(/private judgment/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'unused' }));
  expect(screen.getByText('暂无消息历史记录')).toBeTruthy();
  expect(first.send).not.toHaveBeenCalled();
  expect(first.advance).not.toHaveBeenCalled();
  await act(async () => rendered.rerender(tree(second)));
  expect(screen.getByText(/new Session only/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'narrator' })).toBeNull();
  expect(first.dispose).toHaveBeenCalled();
});
