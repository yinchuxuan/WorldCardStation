import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import useChatPersistence from '../../../src/renderer/chat/useChatPersistence.js';
import useAppClosePersistence from '../../../src/renderer/chat/useAppClosePersistence.js';
import ChatHeader from '../../../src/renderer/components/ChatHeader.jsx';

jest.mock('@platform', () => ({ savePolicy: 'manual', capabilities: { nativeClose: false, diskTrace: false },
  rendererServices: { sessions: {}, window: {}, trace: {} } }));
test('Web state, messages and reading changes keep retry base but never auto-save', async () => {
  const repository = { saveHistory: jest.fn() };
  const { result, rerender } = renderHook(props => useChatPersistence({ ...props, repository }), {
    initialProps: { messages: [], gameState: {}, isLoading: false }
  });
  act(() => { result.current.markLoaded(); result.current.setRetryBase([{ role: 'user', content: 'before' }], { score: 1 }); });
  rerender({ messages: [{ role: 'assistant', content: 'after' }], gameState: { score: 2 }, isLoading: false });
  act(() => result.current.setReadingPosition({ messageId: 'reply', segmentIndex: 2 }));
  await act(async () => {});
  expect(repository.saveHistory).not.toHaveBeenCalled();
  expect(result.current.retryBaseStateRef.current).toEqual({ score: 1 });
});
test('Web never subscribes to native close or mounts developer controls during gameplay', () => {
  const windowService = { onCloseRequested: jest.fn() };
  renderHook(() => useAppClosePersistence({ windowService, flush: jest.fn() }));
  const { container } = render(<ChatHeader onToggleHistory={jest.fn()}>游戏</ChatHeader>);
  expect(windowService.onCloseRequested).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '开发者模式' })).toBeNull();
  expect(container.querySelector('.chat-header-emblem')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('[data-gc-part="game-card-title-icon"]')).toHaveTextContent('square');
  expect(container.querySelector('.runtime-trace-toggle')).toBeNull();
});
