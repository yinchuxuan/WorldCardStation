import { act, renderHook, waitFor } from '@testing-library/react';
import useChatSession from '../../src/renderer/chat/useChatSession.js';

function createOptions(repository) {
  return {
    mainSession: { started: true, beginLoad: jest.fn(), start: jest.fn(),
      restoreHistory: jest.fn(result => ({ messages: result.messages, state: result.gameState })) },
    setMessages: jest.fn(),
    setGameState: jest.fn(),
    setRuntimeError: jest.fn(),
    isLoading: false,
    persistence: {
      hydrate: jest.fn(), markLoaded: jest.fn(), reset: jest.fn(),
      save: jest.fn(async () => ({ success: true }))
    },
    typewriter: { clearStreaming: jest.fn() },
    onResetView: jest.fn(),
    repository
  };
}

describe('useChatSession', () => {
  test('loads messages and game state from the active session', async () => {
    const history = { success: true, messages: [{ role: 'user', content: 'saved' }], gameState: { score: 2 } };
    const repository = { loadHistory: jest.fn(async () => history) };
    const options = createOptions(repository);
    renderHook(() => useChatSession(options));
    await waitFor(() => expect(options.persistence.markLoaded).toHaveBeenCalled());
    expect(options.mainSession.restoreHistory).toHaveBeenCalledWith(history);
    expect(options.persistence.hydrate).toHaveBeenCalledWith(history);
    expect(options.mainSession.start).toHaveBeenCalled();
    expect(options.persistence.markLoaded).toHaveBeenCalled();
  });

  test('saves, switches, resets, and reloads a session in order', async () => {
    const repository = {
      loadHistory: jest.fn(async () => ({ messages: [], gameState: {} })),
      setActive: jest.fn(async id => ({ id }))
    };
    const options = createOptions(repository);
    const { result } = renderHook(() => useChatSession(options));
    await waitFor(() => expect(repository.loadHistory).toHaveBeenCalledTimes(1));
    expect(result.current.revision).toBe(1);
    await act(async () => { await result.current.switchSession('chapter-2'); });
    expect(options.persistence.save).toHaveBeenCalled();
    expect(repository.setActive).toHaveBeenCalledWith('chapter-2');
    expect(options.persistence.reset).toHaveBeenCalled();
    expect(options.onResetView).toHaveBeenCalled();
    expect(repository.loadHistory).toHaveBeenCalledTimes(2);
    expect(result.current.revision).toBe(2);
  });
});
