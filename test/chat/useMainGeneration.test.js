import { renderHook, act } from '@testing-library/react';
import useChatGeneration from '../../src/renderer/chat/useChatGeneration.js';
import { barrier } from '../game-card/agentRuntimeHelpers.js';

function options(mainSession) {
  return { mainSession, messages: [], gameState: {}, typewriter: {}, persistence: {}, isLoading: false,
    setMessages: jest.fn(), setGameState: jest.fn(), setIsLoading: jest.fn(), setRequestError: jest.fn() };
}
function session() {
  return { running: false, send: jest.fn(async () => ({ state: { count: 1 } })),
    retry: jest.fn(async () => ({ state: { count: 2 } })), snapshot: () => ({ state: { count: 0 } }),
    cancel: jest.fn(async () => {}), dispose: jest.fn(async () => {}) };
}

test('existing generation send/retry/stop route to main without broadcasting to legacy Messages', async () => {
  const main = session(), props = options(main);
  const { result, unmount } = renderHook(() => useChatGeneration(props));
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
  expect(main.dispose).toHaveBeenCalledTimes(1);
});

test('failed input is retryable and unfinished state is never presented', async () => {
  const main = session(), props = options(main);
  main.send.mockRejectedValueOnce(new Error('model failed'));
  const { result } = renderHook(() => useChatGeneration(props));
  await act(async () => { expect(await result.current.send('hello')).toBe(false); });
  expect(props.setRequestError).toHaveBeenLastCalledWith(expect.stringContaining('model failed'));
  expect(props.setMessages).toHaveBeenLastCalledWith([]);
  expect(props.setGameState).toHaveBeenLastCalledWith({ count: 0 });
  await act(async () => { await result.current.retry(); });
  expect(props.setMessages.mock.lastCall[0][0].content).toBe('hello');
  main.retry.mockRejectedValueOnce(new Error('again'));
  await act(async () => { await result.current.retry('edited'); });
  await act(async () => { await result.current.retry(); });
  expect(props.setMessages.mock.lastCall[0][0].content).toBe('edited');
  expect(props.setIsLoading).toHaveBeenLastCalledWith(false);
});

test('blank/reentrant input is ignored and replaced Session cannot write to new view', async () => {
  const gate = barrier(), old = session(), next = session();
  const props = options(old);
  old.send.mockImplementation(() => gate.promise);
  const { result, rerender } = renderHook(({ main }) => useChatGeneration({ ...props, mainSession: main }), { initialProps: { main: old } });
  expect(await result.current.send('  ')).toBe(false);
  old.running = true;
  expect(await result.current.send('reentry')).toBe(false);
  old.running = false;
  let waiting;
  act(() => { waiting = result.current.send('old'); });
  rerender({ main: next });
  expect(old.dispose).toHaveBeenCalled();
  await act(async () => { gate.resolve({ state: { count: 999 } }); await waiting; });
  expect(props.setGameState).not.toHaveBeenCalled();
});
