import { act } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import { renderRetryGeneration } from './useChatGenerationTestHarness.js';

describe('useChatGeneration request errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => jest.restoreAllMocks());

  test('reports provider failures without appending an assistant message', async () => {
    global.fetch.mockRejectedValue(new Error('Network failed'));
    const { result, options } = renderRetryGeneration({ messages: [] });

    await act(async () => { await result.current.send('hello'); });

    expect(options.setRequestError).toHaveBeenCalledWith(null);
    expect(options.setRequestError).toHaveBeenLastCalledWith('请求失败: Network failed');
    expect(options.setMessages).toHaveBeenLastCalledWith([
      expect.objectContaining({ role: 'user', content: 'hello' })
    ]);
  });

  test('reports missing configuration while storing only the user input', async () => {
    const { result, options } = renderRetryGeneration({
      messages: [],
      options: { modelConfig: { apiUrl: '', apiKey: '', modelName: '' } }
    });

    await act(async () => { await result.current.send('hello'); });

    expect(options.setRequestError)
      .toHaveBeenCalledWith('请先在右侧设置面板配置模型 API');
    const updater = options.setMessages.mock.calls[0][0];
    expect(updater([])).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' })
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rolls back pre-send progress and injected messages when the request fails', async () => {
    const baseState = { story: { progress: 'FreePlot1' }, visual: { scene: 'school' } };
    const progressedState = { story: { progress: 'FixedPlot1' }, visual: { scene: 'school' } };
    const onRequestFailureRestore = jest.fn();
    jest.spyOn(generationServices, 'preparePreSendMessages').mockImplementation(async ({ messages }) => ({
      applied: true,
      card: { id: 'card' },
      messages: [...messages, { role: 'system', content: 'injected' }],
      state: progressedState
    }));
    jest.spyOn(generationServices, 'sendChatRequest').mockRejectedValue(new Error('Network failed'));
    const { result, options } = renderRetryGeneration({
      messages: [{ role: 'assistant', content: 'old' }],
      gameState: baseState,
      options: { onRequestFailureRestore }
    });

    await act(async () => { await result.current.send('next'); });

    const requestMessages = options.setMessages.mock.calls[0][0];
    expect(options.setGameState).toHaveBeenCalledWith(progressedState);
    expect(options.setGameState).toHaveBeenLastCalledWith(baseState);
    expect(options.setMessages).toHaveBeenLastCalledWith(requestMessages);
    expect(onRequestFailureRestore).toHaveBeenCalledWith(baseState);
  });
});
