import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import useChatSession from '../../src/renderer/chat/useChatSession.js';
import useChatPersistence from '../../src/renderer/chat/useChatPersistence.js';

function renderSession(repository, failure) {
  const onError = jest.fn();
  const typewriter = { clearStreaming: jest.fn() };
  let restored;
  const mainSession = { started: true, beginLoad: jest.fn(),
    restoreHistory(value) {
      if (failure === 'card') throw new Error('unreadable card');
      restored = { messages: value.messages, state: value.gameState };
      return restored;
    },
    async start() { if (failure === 'rule') throw new Error('unreadable rule'); },
    exportSession: () => ({ current: restored, viewState: {} }) };
  const hook = renderHook(() => {
    const [messages, setMessages] = React.useState([]);
    const [gameState, setGameState] = React.useState({});
    const persistence = useChatPersistence({ messages, gameState, isLoading: false, repository, mainSession });
    const session = useChatSession({ mainSession, setMessages, setGameState, setRuntimeError: onError,
      isLoading: false, persistence, typewriter, repository });
    return { session, persistence, messages, gameState, setMessages };
  });
  return { ...hook, onError };
}

afterEach(() => jest.restoreAllMocks());

test.each(['history', 'card', 'rule'])('%s load failure cannot overwrite disk through autosave, explicit save or close', async failure => {
  const repository = { loadHistory: jest.fn(async () => ({ messages: [], gameState: {} })), saveHistory: jest.fn() };
  if (failure === 'history') repository.loadHistory.mockRejectedValue(new Error('unreadable history'));
  const { result, onError } = renderSession(repository, failure);
  await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: `unreadable ${failure}` })));
  expect(result.current.messages).toEqual([]);
  expect(result.current.gameState).toEqual({});
  act(() => result.current.setMessages([{ role: 'user', content: 'must not be saved' }]));
  await act(async () => { await result.current.persistence.flush(); });
  await expect(result.current.session.saveCurrent()).rejects.toThrow('尚未成功加载');
  expect(repository.saveHistory).not.toHaveBeenCalled();
});

test('a successful reload re-enables persistence with the recovered history', async () => {
  const repository = {
    loadHistory: jest.fn().mockRejectedValueOnce(new Error('temporary read failure')).mockResolvedValue({
      messages: [{ id: 'saved', role: 'user', content: 'recovered' }], gameState: { score: 3 }
    }), saveHistory: jest.fn(async () => ({}))
  };
  const { result, onError } = renderSession(repository);
  await waitFor(() => expect(onError).toHaveBeenCalled());
  await act(async () => { await result.current.session.reload(); });
  await act(async () => { await result.current.persistence.flush(); });
  expect(repository.saveHistory).toHaveBeenLastCalledWith(
    [{ id: 'saved', role: 'user', content: 'recovered' }], expect.objectContaining({ gameState: { score: 3 } })
  );
});
