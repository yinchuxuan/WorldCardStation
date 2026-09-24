import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import useChatPersistence from '../../src/renderer/chat/useChatPersistence.js';
import useChatSession from '../../src/renderer/chat/useChatSession.js';
import useMainReading from '../../src/renderer/chat/useMainReading.js';
import { createMainSession } from '../../src/renderer/gameCard/mainSession.js';
jest.mock('@platform', () => ({ savePolicy: 'automatic', rendererServices: { sessions: {} }, gameCardPlatform: {} }));
const definition = { card: { id: 'test', version: '1' }, stateSchema: { count: { type: 'number', default: 0 } },
  agents: { narrator: { definition: { model: 'default', rules: [] } } } };
function fixture() {
  const runtime = createMainSession({ definition });
  const saved = JSON.parse(JSON.stringify(runtime.exportSession()));
  const record = { id: 'visible-round-1-1', role: 'assistant', content: 'first\n\nsecond', mode: 'segmented',
    units: [{ text: 'first', patches: [] }, { text: 'second', patches: ['{"count":1}'] }] };
  saved.sequence = 1;
  saved.current = { state: { count: 1 }, contexts: { narrator: { initialized: true, messages: [
    { id: 'msg-round-1-1', role: 'assistant', content: 'rewritten', ttl: -1 }
  ] } }, records: [record], messages: [{ id: 'user-round-1-', role: 'user', content: 'go' }, record] };
  saved.viewState = { reading: { messageId: record.id, segmentIndex: 0 } };
  return { runtime, saved };
}
test.each(['automatic', 'manual'])('%s uses existing persistence, restores without init and protects damaged loads', async policy => {
  jest.requireMock('@platform').savePolicy = policy;
  const { runtime, saved } = fixture();
  const repository = { loadHistory: jest.fn(async () => ({ runtimeSession: saved, messages: saved.current.messages,
    gameState: saved.current.state, viewState: saved.viewState, saveTarget: { scope: 'a', id: 'one', revision: 1 } })),
    saveHistory: jest.fn(async () => ({ saveTarget: { scope: 'a', id: 'archive', revision: 1 } })), setActive: jest.fn() };
  const runtimeError = jest.fn();
  const typewriter = { clearStreaming: jest.fn() };
  const { result } = renderHook(() => {
    const [messages, setMessages] = React.useState([]), [gameState, setGameState] = React.useState({});
    const [isLoading, setIsLoading] = React.useState(false);
    const persistence = useChatPersistence({ messages, gameState, isLoading, mainSession: runtime, repository });
    const session = useChatSession({ mainSession: runtime, setMessages, setGameState, setRuntimeError: runtimeError,
      isLoading, setIsLoading, persistence, repository, typewriter });
    return { messages, gameState, persistence, session };
  });
  await waitFor(() => expect(result.current.messages).toEqual(saved.current.messages));
  expect(runtime.exportSession()).toEqual(saved);
  expect(repository.loadHistory).toHaveBeenCalledTimes(1);
  if (policy === 'automatic') await waitFor(() => expect(repository.saveHistory).toHaveBeenCalled());
  else expect(repository.saveHistory).not.toHaveBeenCalled();
  await act(async () => { await result.current.persistence.save(); });
  expect(repository.saveHistory).toHaveBeenLastCalledWith(saved.current.messages, expect.objectContaining({ runtimeSession: saved }));
  if (policy === 'manual') expect(repository.saveHistory.mock.calls.at(-1)[1]).toMatchObject({ asNew: true, saveTarget: { id: 'one' } });
  repository.saveHistory.mockRejectedValueOnce(new Error('disk/quota failure'));
  await act(async () => { await expect(result.current.persistence.save()).rejects.toThrow('disk/quota'); });
  expect(runtime.exportSession()).toEqual(saved);
  expect(repository.loadHistory).toHaveBeenCalledTimes(1);
  repository.loadHistory.mockResolvedValueOnce({ runtimeSession: { ...saved, version: 99 } });
  await act(async () => { await result.current.session.reload(); });
  expect(runtimeError).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('已损坏') }));
  const count = repository.saveHistory.mock.calls.length;
  await expect(result.current.persistence.save()).rejects.toThrow('尚未成功加载');
  await result.current.persistence.flush();
  expect(repository.saveHistory).toHaveBeenCalledTimes(count);
  await act(async () => { await result.current.session.reload(); });
  expect(runtime.ready).toBe(true);
});
test('restored reading position navigates saved units without calling reader, model or patches', () => {
  const { runtime, saved } = fixture(); runtime.restoreHistory({ runtimeSession: saved });
  const ref = { current: null };
  const { result } = renderHook(() => useMainReading(runtime, runtime.view(), ref, false));
  expect(result.current.page.text).toBe('first');
  act(() => result.current.navigate('reading.next'));
  expect(result.current.page.text).toBe('second');
  expect(runtime.viewState.reading.segmentIndex).toBe(1);
  expect(runtime.snapshot().state.count).toBe(1);
  expect(runtime.snapshot().contexts.narrator.messages[0].content).toBe('rewritten');
});

test('a late Session load cannot restore over the newly selected Session', async () => {
  jest.requireMock('@platform').savePolicy = 'automatic';
  const { runtime, saved } = fixture();
  let resolveOld;
  const repository = { loadHistory: jest.fn(async () => ({ runtimeSession: saved })) };
  const persistence = { reset: jest.fn(), hydrate: jest.fn(), markLoaded: jest.fn(), manual: { endLeave: jest.fn() } };
  const options = { mainSession: runtime, repository, persistence, setMessages: jest.fn(), setGameState: jest.fn(),
    setRuntimeError: jest.fn(), typewriter: { clearStreaming: jest.fn() } };
  const { result } = renderHook(() => useChatSession(options));
  await waitFor(() => expect(runtime.snapshot().state.count).toBe(1));
  repository.loadHistory.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  let old;
  act(() => { old = result.current.reload(); });
  await waitFor(() => expect(resolveOld).toBeDefined());
  const next = JSON.parse(JSON.stringify(saved)); next.current.state.count = 2;
  repository.loadHistory.mockResolvedValueOnce({ runtimeSession: next });
  await act(async () => result.current.reload());
  expect(runtime.snapshot().state.count).toBe(2);
  await act(async () => { resolveOld({ runtimeSession: saved }); await old; });
  expect(runtime.snapshot().state.count).toBe(2);
  expect(options.setRuntimeError).toHaveBeenLastCalledWith(null);
});
