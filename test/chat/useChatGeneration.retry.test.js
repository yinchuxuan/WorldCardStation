import { act } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import { prepareAfterResponseMessages } from '../../src/renderer/gameCard/sendPipeline.js';
import { renderRetryGeneration } from './useChatGenerationTestHarness.js';

describe('useChatGeneration retry pipeline', () => {
  const originalPre = generationServices.preparePreSendMessages;
  const originalAfter = generationServices.prepareAfterResponseMessages;
  const originalSend = generationServices.sendChatRequest;
  afterEach(() => {
    generationServices.preparePreSendMessages = originalPre;
    generationServices.prepareAfterResponseMessages = originalAfter;
    generationServices.sendChatRequest = originalSend;
  });

  test('retries from the saved user-turn snapshot and reapplies rules', async () => {
    generationServices.preparePreSendMessages = jest.fn(async ({ messages }) => ({
      applied: true, card: { id: 'card' },
      messages: [{ role: 'system', content: 'new rules', _meta: { visibility: 'llm_only' } }, ...messages]
    }));
    generationServices.sendChatRequest = jest.fn(async (_payload, callbacks) => callbacks.onToken('New answer'));
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages }) => ({
      applied: true,
      messages: [...messages, { role: 'system', content: 'new after', _meta: { source: 'game_card' } }]
    }));
    const { result, options } = renderRetryGeneration({
      messages: [
        { role: 'system', content: 'old rules', _meta: { visibility: 'llm_only' } },
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Old answer' }
      ],
      retryBaseMessages: [{ role: 'user', content: 'Question' }]
    });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'Question' }], state: {}, traceContext: { begin: expect.any(Function) }
    });
    expect(generationServices.sendChatRequest.mock.calls[0][0].messages).toEqual([
      { role: 'system', content: 'new rules' }, { role: 'user', content: 'Question' }
    ]);
    expect(options.setMessages).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ content: 'New answer' }),
      expect.objectContaining({ content: 'new after' })
    ]));
  });

  test('retries from saved game state and stores returned state', async () => {
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state: { score: state.score + 1 }, applied: false, card: { id: 'card' } }));
    generationServices.sendChatRequest = jest.fn(async (_payload, callbacks) => callbacks.onToken('answer'));
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages, state }) => ({ messages, state: { score: state.score + 10 }, applied: false }));
    const { result, options } = renderRetryGeneration({ retryBaseState: { score: 5 }, gameState: { score: 99 } });
    await act(async () => { await result.current.retry(); });
    expect(generationServices.preparePreSendMessages.mock.calls[0][0].state).toEqual({ score: 5 });
    expect(options.setGameState).toHaveBeenLastCalledWith({ score: 16 });
  });

  test('applies only the new assistant state patch from the saved state', async () => {
    const card = { version: '1', id: 'patch-card', name: 'Patch Card', rules: [] };
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state, applied: false, card }));
    generationServices.prepareAfterResponseMessages = prepareAfterResponseMessages;
    generationServices.sendChatRequest = jest.fn(async (_payload, callbacks) => callbacks.onToken('<state_patch>{"type":"state.set","path":"score","value":2}</state_patch>'));
    const { result, options } = renderRetryGeneration({
      messages: [{ role: 'user', content: 'Q' }, { role: 'assistant', content: '<state_patch>{"type":"state.set","path":"score","value":9}</state_patch>' }],
      retryBaseState: { score: 0 },
      gameState: { score: 9 }
    });
    await act(async () => { await result.current.retry(); });
    expect(options.setGameState).toHaveBeenLastCalledWith({ score: 2 });
  });

  test('stops an active generation before retrying from its snapshot', async () => {
    const events = [];
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: false, card: { id: 'card' }
    }));
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: false
    }));
    generationServices.sendChatRequest = jest.fn()
      .mockImplementationOnce((request, callbacks) => new Promise((resolve, reject) => {
        events.push('active-started');
        callbacks.onToken('partial');
        const rejectStopped = () => {
          events.push('active-stopped');
          const error = new Error('stopped');
          error.name = 'AbortError';
          reject(error);
        };
        if (request.signal.aborted) rejectStopped();
        else request.signal.addEventListener('abort', rejectStopped);
      }))
      .mockImplementationOnce(async (_request, callbacks) => {
        events.push('retry-started');
        callbacks.onToken('replacement');
      });
    const { result, options } = renderRetryGeneration();

    await act(async () => {
      const active = result.current.send('next action');
      const retried = result.current.retry('edited action');
      await Promise.all([active, retried]);
    });

    expect(events).toEqual(['active-started', 'active-stopped', 'retry-started']);
    expect(options.setMessages).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'edited action' }),
      expect.objectContaining({ role: 'assistant', content: 'replacement' })
    ]));
  });
});
