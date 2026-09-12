import { act, renderHook, waitFor } from '@testing-library/react';
import useChatPersistence from '../../src/renderer/chat/useChatPersistence.js';

describe('useChatPersistence', () => {
  test('preserves retry snapshots and saves all session state together', async () => {
    const repository = { saveHistory: jest.fn(async () => ({})) };
    const { result } = renderHook(() => useChatPersistence({
      messages: [{ role: 'user', content: 'current' }],
      gameState: { score: 2 },
      isLoading: false,
      repository
    }));
    const retryMessages = [
      { role: 'system', content: 'temporary', ttl: 1 },
      { role: 'system', content: 'permanent', ttl: -1 },
      { role: 'system', content: 'multi-turn', ttl: 5 },
      { role: 'user', content: 'A\n\n---\n<wa2_turn_context>old</wa2_turn_context>' }
    ];
    act(() => { result.current.markLoaded(); result.current.setRetryBase(retryMessages, { score: 1 }); });
    await act(async () => { await result.current.save(); });
    expect(repository.saveHistory).toHaveBeenCalledWith([{ role: 'user', content: 'current' }], {
      gameState: { score: 2 },
      retryBaseMessages: retryMessages,
      retryBaseState: { score: 1 },
      viewState: {}
    });
  });

  test('auto-saves only after history is loaded and generation is idle', async () => {
    const repository = { saveHistory: jest.fn(async () => ({})) };
    const { result, rerender } = renderHook((props) => useChatPersistence({ ...props, repository }), {
      initialProps: { messages: [], gameState: {}, isLoading: false }
    });
    rerender({ messages: [{ role: 'user', content: 'before' }], gameState: {}, isLoading: false });
    expect(repository.saveHistory).not.toHaveBeenCalled();
    act(() => result.current.markLoaded());
    rerender({ messages: [{ role: 'user', content: 'during' }], gameState: {}, isLoading: true });
    expect(repository.saveHistory).not.toHaveBeenCalled();
    rerender({ messages: [{ role: 'user', content: 'after' }], gameState: { score: 3 }, isLoading: false });
    await waitFor(() => expect(repository.saveHistory).toHaveBeenLastCalledWith(
      [{ role: 'user', content: 'after' }],
      { gameState: { score: 3 }, retryBaseMessages: null, retryBaseState: null, viewState: {} }
    ));
  });

  test('hydrates and saves the current segmented reading position', async () => {
    const repository = { saveHistory: jest.fn(async () => ({})) };
    const { result } = renderHook(() => useChatPersistence({
      messages: [{ id: 'reply', role: 'assistant', content: 'response' }],
      gameState: { score: 2 }, isLoading: false, repository
    }));
    act(() => result.current.hydrate({
      viewState: { reading: { messageId: 'reply', segmentIndex: 2 } }
    }));
    expect(result.current.readingPosition).toEqual({ messageId: 'reply', segmentIndex: 2 });

    act(() => result.current.setReadingPosition({ messageId: 'reply', segmentIndex: 3 }));
    act(() => result.current.markLoaded());
    await act(async () => { await result.current.save(); });
    expect(repository.saveHistory).toHaveBeenLastCalledWith(expect.any(Array),
      expect.objectContaining({
        gameState: { score: 2 },
        viewState: { reading: { messageId: 'reply', segmentIndex: 3 } }
      }));
  });

  test('does not auto-save stale session data while a new session is loading', async () => {
    const repository = { saveHistory: jest.fn(async () => ({})) };
    const { result } = renderHook(() => useChatPersistence({
      messages: [{ role: 'user', content: 'old session' }],
      gameState: { score: 9 }, isLoading: false, repository
    }));
    act(() => result.current.markLoaded());
    act(() => result.current.reset());
    await act(async () => { await Promise.resolve(); });

    expect(repository.saveHistory).not.toHaveBeenCalled();
  });

  test('does not overwrite history when closing before hydration finishes', async () => {
    const repository = { saveHistory: jest.fn(async () => ({})) };
    const { result } = renderHook(() => useChatPersistence({
      messages: [], gameState: {}, isLoading: false, repository
    }));

    await act(async () => { await result.current.flush(); });

    expect(repository.saveHistory).not.toHaveBeenCalled();
  });

  test('hydrates retry base with the active session', () => {
    const persisted = { retryBaseMessages: [{ role: 'user', content: 'Q' }], retryBaseState: { score: 4 } };
    const repository = { saveHistory: jest.fn() };
    const { result } = renderHook(() => useChatPersistence({ messages: [], gameState: {}, isLoading: false, repository }));
    act(() => result.current.hydrate(persisted));
    expect(result.current.retryBaseRef.current).toEqual(persisted.retryBaseMessages);
    expect(result.current.retryBaseStateRef.current).toEqual({ score: 4 });
  });

  test('flushes the latest snapshot after an earlier save finishes', async () => {
    let finishFirst;
    const repository = {
      saveHistory: jest.fn()
        .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
        .mockResolvedValue({})
    };
    const { result, rerender } = renderHook((props) => useChatPersistence({
      ...props, repository
    }), {
      initialProps: { messages: [], gameState: { score: 0 }, isLoading: false }
    });
    act(() => result.current.markLoaded());
    rerender({ messages: [], gameState: { score: 1 }, isLoading: false });
    await waitFor(() => expect(repository.saveHistory).toHaveBeenCalledTimes(1));

    rerender({ messages: [], gameState: { score: 2 }, isLoading: false });
    const flushed = result.current.flush();
    expect(repository.saveHistory).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishFirst({});
      await flushed;
    });

    expect(repository.saveHistory).toHaveBeenCalledTimes(2);
    expect(repository.saveHistory).toHaveBeenLastCalledWith([], expect.objectContaining({
      gameState: { score: 2 }
    }));
  });
});
