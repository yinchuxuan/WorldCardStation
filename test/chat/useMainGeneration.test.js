import { renderHook, act } from '@testing-library/react';
import useChatGeneration from '../../src/renderer/chat/useChatGeneration.js';
import useMainView from '../../src/renderer/chat/useMainView.js';
import { barrier } from '../game-card/agentRuntimeHelpers.js';

function options(mainSession) {
  return { mainSession, messages: [], gameState: {}, typewriter: {}, persistence: {}, isLoading: false,
    setMessages: jest.fn(), setGameState: jest.fn(), setIsLoading: jest.fn(), setRequestError: jest.fn() };
}
function session() {
  let view = { state: { count: 0 }, messages: [] }, input;
  const listeners = new Set();
  const publish = (content, count) => {
    input = content ?? input;
    view = { state: { count }, messages: [{ role: 'user', content: input }] };
    listeners.forEach(listener => listener(view, { type: 'complete' }));
    return view;
  };
  return { running: false, send: jest.fn(async content => publish(content, 1)),
    retry: jest.fn(async content => publish(content, 2)), snapshot: () => view,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    cancel: jest.fn(async () => {}), dispose: jest.fn(async () => {}) };
}

function useGeneration(props) {
  useMainView(props);
  return useChatGeneration(props);
}

test('existing generation send/retry/stop route to main without broadcasting to legacy Messages', async () => {
  const main = session(), props = options(main);
  const { result, unmount } = renderHook(() => useGeneration(props));
  await act(async () => { expect(await result.current.send('hello')).toBe(true); });
  expect(main.send).toHaveBeenCalledWith('hello');
  expect(props.setGameState).toHaveBeenLastCalledWith({ count: 1 });
  expect(props.setMessages).toHaveBeenLastCalledWith([expect.objectContaining({ role: 'user', content: 'hello' })]);
  await act(async () => { await result.current.retry('edited'); });
  expect(main.retry).toHaveBeenCalledWith('edited');
  expect(props.setMessages.mock.lastCall[0]).toHaveLength(1);
  expect(props.setMessages.mock.lastCall[0][0].content).toBe('edited');
  await result.current.stop();
  expect(main.cancel).toHaveBeenCalledTimes(1);
  unmount();
  expect(main.dispose).not.toHaveBeenCalled();
});

test('accepted input can fail asynchronously without corrupting the view and remains retryable', async () => {
  const main = session(), props = options(main);
  main.send.mockRejectedValueOnce(new Error('model failed'));
  const { result } = renderHook(() => useGeneration(props));
  await act(async () => { expect(result.current.send('hello')).toBe(true); });
  expect(props.setRequestError).toHaveBeenLastCalledWith(expect.stringContaining('model failed'));
  expect(props.setMessages).toHaveBeenLastCalledWith([]);
  expect(props.setGameState).toHaveBeenLastCalledWith({ count: 0 });
  await act(async () => { await result.current.retry('hello'); });
  expect(props.setMessages.mock.lastCall[0][0].content).toBe('hello');
  main.retry.mockRejectedValueOnce(new Error('again'));
  await act(async () => { await result.current.retry('edited'); });
  await act(async () => { await result.current.retry('edited'); });
  expect(props.setMessages.mock.lastCall[0][0].content).toBe('edited');
  expect(props.setIsLoading).toHaveBeenLastCalledWith(false);
});

test('running input is accepted immediately; blank/paused inputs and stale Session updates are ignored', async () => {
  const gate = barrier(), old = session(), next = session();
  const props = options(old);
  old.send.mockImplementation(() => gate.promise);
  const { result, rerender } = renderHook(({ main }) => useGeneration({ ...props, mainSession: main }), { initialProps: { main: old } });
  expect(await result.current.send('  ')).toBe(false);
  old.running = true;
  expect(result.current.send('queued')).toBe(true);
  old.queuePaused = true;
  expect(result.current.send('paused')).toBe(false);
  old.queuePaused = false;
  old.running = false;
  let waiting;
  act(() => { waiting = result.current.send('old'); });
  rerender({ main: next });
  expect(old.dispose).not.toHaveBeenCalled();
  await act(async () => { gate.resolve({ state: { count: 999 } }); await waiting; });
  expect(props.setGameState).toHaveBeenLastCalledWith({ count: 0 });
  expect(props.setGameState).not.toHaveBeenCalledWith({ count: 999 });
});
