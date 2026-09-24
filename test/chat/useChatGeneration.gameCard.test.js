import { act, renderHook } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import useChatGeneration from '../../src/renderer/chat/useChatGeneration.js';

function createTypewriter() {
  let content = '';
  return {
    clearStreaming: jest.fn(() => { content = ''; }),
    startStreaming: jest.fn(),
    pushContent: jest.fn((text, type) => { if (type !== 'reasoning') content += text; return text; }),
    finishStreaming: jest.fn(),
    getAccumulatedContent: jest.fn(() => content),
    getThinkingContent: jest.fn(() => ''),
    reset: jest.fn(() => { content = ''; })
  };
}

function createPersistence() {
  return {
    retryBaseRef: { current: null },
    retryBaseStateRef: { current: null },
    setRetryBase: jest.fn()
  };
}

function renderGeneration(overrides = {}) {
  const options = {
    messages: [],
    setMessages: jest.fn(),
    gameState: {},
    setGameState: jest.fn(),
    modelConfig: { apiUrl: 'https://api.example.com/v1', apiKey: 'key', modelName: 'gpt-4' },
    typewriter: createTypewriter(),
    persistence: createPersistence(),
    isLoading: false,
    setIsLoading: jest.fn(),
    setRuntimeError: jest.fn(),
    setShowStreamThinking: jest.fn(),
    ...overrides
  };
  const hook = renderHook(() => useChatGeneration(options));
  return { ...hook, options };
}

describe('useChatGeneration game card pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue(global.createStreamingMock('ok'));
  });

  test('sends unmodified messages without an active card', async () => {
    global.platformMock.getActiveGameCard.mockResolvedValue({ success: true, card: null });
    const { result } = renderGeneration();
    await act(async () => { await result.current.send('hello'); });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  test('passes generation parameters from model config', async () => {
    const { result } = renderGeneration({
      modelConfig: {
        apiUrl: 'https://api.example.com/v1', apiKey: 'key', modelName: 'gpt-4',
        maxTokens: '2048', temperature: '0.8', topP: '0.9', frequencyPenalty: '0.2', presencePenalty: '0.4'
      }
    });
    await act(async () => { await result.current.send('hello'); });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ max_tokens: 2048, temperature: 0.8, top_p: 0.9, frequency_penalty: 0.2, presence_penalty: 0.4 });
  });

  test('appends the assistant response through the state updater', async () => {
    const setMessages = jest.fn();
    const { result, options } = renderGeneration({ setMessages });
    await act(async () => { await result.current.send('hello'); });
    expect(setMessages.mock.calls[0][0]).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' })
    ]);
    const updater = setMessages.mock.calls.at(-1)[0];
    const updated = updater([{ role: 'user', content: 'hello' }]);
    expect(updated).toEqual([
      { role: 'user', content: 'hello' },
      expect.objectContaining({ role: 'assistant', content: 'ok', _thinking: '', thinking: '' })
    ]);
    expect(updated[1].id).toBe(options.typewriter.startStreaming.mock.calls[0][0]);
  });

  test('sends pre_send transformed messages', async () => {
    global.platformMock.getActiveGameCard.mockResolvedValue({
      success: true,
      card: {
        version: '1', id: 'active', name: 'Active Card',
        rules: [{ when: { phase: 'pre_send' }, then: [{ type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system', content: 'rules' }] }]
      }
    });
    const setMessages = jest.fn();
    const { result } = renderGeneration({ setMessages });
    await act(async () => { await result.current.send('hello'); });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: 'system', content: 'rules' }, { role: 'user', content: 'hello' }]);
    expect(setMessages).toHaveBeenCalledWith([
      { role: 'system', content: 'rules' },
      expect.objectContaining({ role: 'user', content: 'hello' })
    ]);
  });

  test('applies after_response rules before storing the assistant', async () => {
    global.platformMock.getActiveGameCard.mockResolvedValue({
      success: true,
      card: {
        version: '1', id: 'active', name: 'Active Card',
        rules: [{ when: { phase: 'after_response' }, then: [{ type: 'replace', predicate: { index: 'last' }, content: 'cleaned' }] }]
      }
    });
    const setMessages = jest.fn();
    const { result } = renderGeneration({ setMessages });
    await act(async () => { await result.current.send('hello'); });
    expect(setMessages).toHaveBeenLastCalledWith([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'cleaned', _thinking: '', thinking: '' })
    ]);
  });

  test('applies after_stream and after_response in order', async () => {
    global.platformMock.getActiveGameCard.mockResolvedValue({
      success: true,
      card: {
        version: '1', id: 'segmented', name: 'Segmented',
        rules: [
          { when: { phase: 'after_stream' }, then: [
            { type: 'state.set', path: 'summaryApplied', value: true }
          ] },
          { when: { phase: 'after_response' }, then: [
            { type: 'state.set', path: 'readingFinished', value: true }
          ] }
        ]
      }
    });
    const setGameState = jest.fn();
    const setMessages = jest.fn();
    const { result } = renderGeneration({ setGameState, setMessages });

    await act(async () => { await result.current.send('hello'); });

    expect(setGameState).toHaveBeenLastCalledWith({ summaryApplied: true, readingFinished: true });
    expect(setMessages).toHaveBeenLastCalledWith([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'ok' })
    ]);
  });

  test('passes and updates game state', async () => {
    const originalPreSend = generationServices.preparePreSendMessages;
    const originalAfter = generationServices.prepareAfterResponseMessages;
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state: { score: state.score + 1 }, applied: false, card: { id: 'state' } }));
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages, state }) => ({ messages, state: { score: state.score + 10 }, applied: false }));
    const setGameState = jest.fn();
    const { result } = renderGeneration({ gameState: { score: 1 }, setGameState });
    await act(async () => { await result.current.send('hello'); });
    expect(generationServices.prepareAfterResponseMessages.mock.calls[0][0].state).toEqual({ score: 2 });
    expect(setGameState).toHaveBeenLastCalledWith({ score: 12 });
    generationServices.preparePreSendMessages = originalPreSend;
    generationServices.prepareAfterResponseMessages = originalAfter;
  });

  test('reports pre_send game card errors', async () => {
    const originalPreSend = generationServices.preparePreSendMessages;
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({ messages, state, error: '游戏卡状态 schema 校验失败' }));
    const setRuntimeError = jest.fn();
    const { result } = renderGeneration({ setRuntimeError });
    await act(async () => { await result.current.send('hello'); });
    expect(setRuntimeError).toHaveBeenCalledWith(expect.objectContaining({ message: '游戏卡状态 schema 校验失败' }));
    expect(global.fetch).not.toHaveBeenCalled();
    generationServices.preparePreSendMessages = originalPreSend;
  });
});
