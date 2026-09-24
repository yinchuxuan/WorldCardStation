import { act } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import { renderRetryGeneration } from './useChatGenerationTestHarness.js';

describe('useChatGeneration retry state snapshot', () => {
  const originalPre = generationServices.preparePreSendMessages;
  const originalAfter = generationServices.prepareAfterResponseMessages;
  const originalSend = generationServices.sendChatRequest;

  beforeEach(() => {
    generationServices.sendChatRequest = jest.fn(async (_payload, callbacks) => callbacks.onToken('retry answer'));
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false }));
  });
  afterEach(() => {
    generationServices.preparePreSendMessages = originalPre;
    generationServices.prepareAfterResponseMessages = originalAfter;
    generationServices.sendChatRequest = originalSend;
  });

  test('keeps timeline base state but reruns random pre_send rules', async () => {
    const randomValues = [11, 88];
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, applied: true, card: { id: 'card' },
      state: { ...state, temp: { plotDirectionRoll: randomValues.shift() } }
    }));
    const { result, options } = renderRetryGeneration({
      retryBaseState: { timeline: { currentTime: 'old-time' } },
      gameState: { timeline: { currentTime: 'advanced-time' } }
    });
    await act(async () => { await result.current.retry(); await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls.map(call => call[0].state)).toEqual([
      { timeline: { currentTime: 'old-time' } },
      { timeline: { currentTime: 'old-time' } }
    ]);
    expect(options.setGameState).toHaveBeenLastCalledWith({ timeline: { currentTime: 'old-time' }, temp: { plotDirectionRoll: 88 } });
  });

  test('does not fall back to advanced current state when retry state is missing', async () => {
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false, card: { id: 'card' } }));
    const { result } = renderRetryGeneration({ retryBaseState: null, gameState: { timeline: { currentTime: 'advanced-time' } } });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls[0][0].state).toEqual({});
  });

  test('restores the complete retry snapshot before rerunning pre_send', async () => {
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false, card: { id: 'card' } }));
    const retryBaseMessages = [
      { role: 'system', content: 'old state', ttl: 1 },
      { role: 'user', content: '选择A\n\n---\n<wa2_turn_context>\n旧上下文\n</wa2_turn_context>' }
    ];
    const retryBaseState = { timeline: { currentTime: 'hydrated-time' } };
    const { result, options } = renderRetryGeneration({ retryBaseMessages, retryBaseState });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls[0][0]).toMatchObject({
      messages: retryBaseMessages, state: retryBaseState
    });
    // Changes to the resulting view must not corrupt the next retry's snapshot.
    const displayed = options.setGameState.mock.calls.at(-1)[0];
    displayed.timeline.currentTime = 'changed-after-retry';
    expect(retryBaseState).toEqual({ timeline: { currentTime: 'hydrated-time' } });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls.at(-1)[0].state).toEqual(retryBaseState);
  });

});
