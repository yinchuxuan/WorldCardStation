import { act } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import { renderRetryGeneration } from './useChatGenerationTestHarness.js';

describe('useChatGeneration state patch cursor', () => {
  const originals = { ...generationServices };

  afterEach(() => {
    Object.assign(generationServices, originals);
  });

  test('applies a fragmented leading patch before visible body starts', async () => {
    const events = [];
    const patchedState = {
      scene: { portrait: 'touma_normal' },
      visual: { portraits: { touma: 'normal' } }
    };
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      applied: false,
      card: { id: 'card' },
      messages,
      state
    }));
    generationServices.prepareStatePatchAtCursor = jest.fn(async () => {
      await Promise.resolve();
      events.push('patch');
      return { applied: true, state: patchedState };
    });
    generationServices.sendChatRequest = jest.fn(async (_request, callbacks) => {
      callbacks.onToken('<state_');
      callbacks.onToken('patch>[{"type":"state.set","path":"scene.portrait",');
      callbacks.onToken('"value":"touma_normal"}]</state_patch>');
      callbacks.onToken('\n正文');
    });
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages }) => ({
      applied: false, messages, state: patchedState
    }));
    const setGameState = jest.fn(state => {
      if (state === patchedState) events.push('state');
    });
    const onStreamContentStart = jest.fn(() => events.push('body'));
    const { result, options } = renderRetryGeneration({
      onStreamContentStart,
      options: { setGameState }
    });

    await act(async () => { await result.current.retry(); });

    expect(events.slice(0, 3)).toEqual(['patch', 'state', 'body']);
    expect(onStreamContentStart).toHaveBeenCalledWith({
      card: { id: 'card' },
      state: patchedState
    });
    expect(options.setGameState).toHaveBeenCalledWith(patchedState);
    expect(options.setGameState).toHaveBeenLastCalledWith(patchedState);
    const streamed = options.typewriter.pushContent.mock.calls
      .filter(([, type]) => type !== 'reasoning')
      .map(([text]) => text)
      .join('');
    expect(streamed).not.toContain('<state_patch>');
    expect(streamed).toContain('正文');
    const completedMessages = generationServices.prepareAfterResponseMessages.mock.calls[0][0].messages;
    expect(completedMessages.at(-1).content).toContain('<state_patch>');
  });

  function mockPatchedFailure(patchedState, errorName) {
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      applied: false, card: { id: 'card' }, messages, state
    }));
    generationServices.prepareStatePatchAtCursor = jest.fn(async () => ({
      applied: true, state: patchedState
    }));
    generationServices.sendChatRequest = jest.fn(async (_request, callbacks) => {
      callbacks.onToken(
        '<state_patch>{"type":"state.set","path":"visual.scene","value":"room"}</state_patch>'
      );
      const error = new Error(errorName);
      error.name = errorName;
      throw error;
    });
  }

  test('keeps the applied patch after the user aborts', async () => {
    const patchedState = { visual: { portraits: { touma: 'normal' } } };
    mockPatchedFailure(patchedState, 'AbortError');
    const { result, options } = renderRetryGeneration();

    await act(async () => { await result.current.retry(); });

    expect(options.setGameState).toHaveBeenCalledWith(patchedState);
    expect(options.setGameState).toHaveBeenLastCalledWith(patchedState);
  });

  test('restores the request snapshot after a provider failure', async () => {
    const baseMessages = [{ role: 'user', content: 'Q' }];
    const baseState = { visual: { scene: 'school', portraits: {} } };
    const patchedState = { visual: { scene: 'room', portraits: { touma: 'normal' } } };
    const onRequestFailureRestore = jest.fn();
    mockPatchedFailure(patchedState, 'Error');
    const { result, options } = renderRetryGeneration({
      retryBaseMessages: baseMessages,
      retryBaseState: baseState,
      options: { onRequestFailureRestore }
    });

    await act(async () => { await result.current.retry(); });

    expect(options.setGameState).toHaveBeenCalledWith(patchedState);
    expect(options.setGameState).toHaveBeenLastCalledWith(baseState);
    expect(options.setMessages).toHaveBeenLastCalledWith(baseMessages);
    expect(onRequestFailureRestore).toHaveBeenCalledWith(baseState);
  });
});
