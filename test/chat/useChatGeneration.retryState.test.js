import { act } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import { renderRetryGeneration } from './useChatGenerationTestHarness.js';

describe('useChatGeneration retry state snapshot', () => {
  const originalPre = generationServices.preparePreSendMessages;
  const originalAfter = generationServices.prepareAfterResponseMessages;
  const originalSend = generationServices.sendChatRequest;
  const originalClone = global.structuredClone;

  beforeEach(() => {
    generationServices.sendChatRequest = jest.fn(async (_payload, callbacks) => callbacks.onToken('retry answer'));
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false }));
  });
  afterEach(() => {
    generationServices.preparePreSendMessages = originalPre;
    generationServices.prepareAfterResponseMessages = originalAfter;
    generationServices.sendChatRequest = originalSend;
    global.structuredClone = originalClone;
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

  test('uses the retry base already hydrated in memory', async () => {
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false, card: { id: 'card' } }));
    const { result } = renderRetryGeneration({
      retryBaseMessages: [{ role: 'user', content: 'Q' }],
      retryBaseState: { timeline: { currentTime: 'hydrated-time' } }
    });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls[0][0].state).toEqual({
      timeline: { currentTime: 'hydrated-time' }
    });
  });

  test('restores the complete retry snapshot before rerunning pre_send', async () => {
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false, card: { id: 'card' } }));
    const retryBaseMessages = [
      { role: 'system', content: 'old state', ttl: 1 },
      { role: 'user', content: '选择A\n\n---\n<wa2_turn_context>\n旧上下文\n</wa2_turn_context>' }
    ];
    const { result } = renderRetryGeneration({ retryBaseMessages });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls[0][0].messages).toEqual(retryBaseMessages);
  });

  test('does not rely on structuredClone for persisted state', async () => {
    global.structuredClone = jest.fn(() => ({}));
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false, card: { id: 'card' } }));
    const { result } = renderRetryGeneration({
      retryBaseMessages: [{ role: 'user', content: 'Q' }],
      retryBaseState: { timeline: { currentTime: 'persisted-time' } }
    });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls[0][0].state).toEqual({ timeline: { currentTime: 'persisted-time' } });
  });
});
