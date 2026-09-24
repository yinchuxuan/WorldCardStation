import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import useChatPersistence from '../../../src/renderer/chat/useChatPersistence.js';
import useAppClosePersistence from '../../../src/renderer/chat/useAppClosePersistence.js';
import ChatHeader from '../../../src/renderer/components/ChatHeader.jsx';

jest.mock('@platform', () => ({ savePolicy: 'manual', capabilities: { nativeClose: false, diskTrace: false },
  rendererServices: { sessions: {}, window: {}, trace: {} } }));
test('Web state, messages and view notifications keep retry base but never auto-save', async () => {
  const repository = { saveHistory: jest.fn() };
  const { result, rerender } = renderHook(props => useChatPersistence({ ...props, repository }), {
    initialProps: { messages: [], gameState: {}, isLoading: false }
  });
  act(() => { result.current.markLoaded(); result.current.setRetryBase([{ role: 'user', content: 'before' }], { score: 1 }); });
  rerender({ messages: [{ role: 'assistant', content: 'after' }], gameState: { score: 2 }, isLoading: false });
  act(() => result.current.notifyViewChanged());
  await act(async () => {});
  expect(repository.saveHistory).not.toHaveBeenCalled();
  expect(result.current.retryBaseStateRef.current).toEqual({ score: 1 });
});
test('runtime reading changes are saved only by explicit save with the complete runtime snapshot', async () => {
  const saved = { current: { messages: [], state: {} }, viewState: { reading: null } };
  const mainSession = { exportSession: () => saved };
  const repository = { saveHistory: jest.fn(async () => ({})) };
  const { result } = renderHook(() => useChatPersistence({
    messages: [], gameState: {}, isLoading: false, mainSession, repository
  }));
  act(() => { result.current.hydrate({ runtimeSession: saved }); result.current.markLoaded(); });
  saved.viewState = { reading: { messageId: 'reply', segmentIndex: 2 } };
  act(() => result.current.notifyViewChanged());
  expect(result.current.manual.dirty).toBe(true);
  expect(repository.saveHistory).not.toHaveBeenCalled();
  await act(() => result.current.save());
  expect(repository.saveHistory).toHaveBeenCalledWith([], expect.objectContaining({
    asNew: true, runtimeSession: saved, viewState: saved.viewState
  }));
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
