import { act, renderHook, waitFor } from '@testing-library/react';
import useChatSession from '../../src/renderer/chat/useChatSession.js';
import useMainView from '../../src/renderer/chat/useMainView.js';
import { barrier } from '../game-card/agentRuntimeHelpers.js';
jest.mock('@platform', () => ({ savePolicy: 'automatic', rendererServices: { sessions: {} }, gameCardPlatform: {} }));

test('session loading publishes startup previews but only enables saving after startup completes', async () => {
  const gate = barrier(), snapshot = { messages: [], state: {}, contexts: {}, records: [] };
  let listener;
  const mainSession = { started: false, beginLoad: jest.fn(), snapshot: () => snapshot,
    restoreHistory: jest.fn(() => snapshot), subscribe: fn => { listener = fn; return jest.fn(); },
    start: jest.fn(async () => {
      mainSession.running = true;
      listener({ ...snapshot, messages: [{ role: 'assistant', content: 'opening' }] });
      await gate.promise;
      mainSession.started = true;
      mainSession.running = false;
      listener({ ...snapshot, state: { ready: true } });
      return { ...snapshot, state: { ready: true } };
    }) };
  const persistence = { reset: jest.fn(), hydrate: jest.fn(), markLoaded: jest.fn(), save: jest.fn() };
  const props = { mainSession, persistence, repository: { loadHistory: jest.fn(async () => ({})) },
    setMessages: jest.fn(), setGameState: jest.fn(), setRuntimeError: jest.fn(), setIsLoading: jest.fn(), typewriter: {} };
  renderHook(() => { useMainView(props); return useChatSession(props); });
  await waitFor(() => expect(mainSession.start).toHaveBeenCalledTimes(1));
  expect(props.setMessages).toHaveBeenLastCalledWith([{ role: 'assistant', content: 'opening' }]);
  expect(props.setIsLoading).toHaveBeenLastCalledWith(true);
  expect(persistence.markLoaded).not.toHaveBeenCalled();
  await act(async () => { gate.resolve(); });
  expect(persistence.markLoaded).toHaveBeenCalledTimes(1);
  expect(props.setGameState).toHaveBeenLastCalledWith({ ready: true });
  expect(props.setIsLoading).toHaveBeenLastCalledWith(false);
});

test('failed startup remains unsaveable but can be left without overwriting the empty Session', async () => {
  const snapshot = { messages: [], state: {} };
  const mainSession = { started: false, beginLoad: jest.fn(), snapshot: () => snapshot,
    restoreHistory: () => snapshot, subscribe: () => () => {}, start: async () => { throw new Error('startup failed'); } };
  const persistence = { reset: jest.fn(), hydrate: jest.fn(), markLoaded: jest.fn(), save: jest.fn() };
  const props = { mainSession, persistence, repository: { loadHistory: async () => ({}) },
    setMessages: jest.fn(), setGameState: jest.fn(), setRuntimeError: jest.fn(), setIsLoading: jest.fn(), typewriter: {} };
  const { result } = renderHook(() => useChatSession(props));
  await waitFor(() => expect(props.setRuntimeError).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'startup failed' })));
  expect(persistence.markLoaded).not.toHaveBeenCalled();
  await expect(result.current.beforeLeave()).resolves.toBe(true);
  expect(persistence.save).not.toHaveBeenCalled();
});
