const { act } = require('@testing-library/react');
const generationServices = require('../../src/renderer/chat/generationServices').default;
const { renderRetryGeneration } = require('./useChatGenerationTestHarness');

function card(rule, maxRetries = 2) {
  return {
    version: '1',
    id: 'response-validation-card',
    name: 'Response Validation Card',
    rules: [],
    responseValidation: { maxRetries, rules: [rule] }
  };
}

function choicesRule(onFailure = 'retry') {
  return {
    id: 'choices',
    type: 'content.regex',
    pattern: '<choices>[\\s\\S]*?<\\/choices>',
    matches: { eq: 1 },
    onFailure,
    message: '必须输出 choices 块'
  };
}

describe('useChatGeneration response validation', () => {
  const originals = { ...generationServices };

  beforeEach(() => {
    generationServices.prepareAfterResponseMessages = jest.fn(async options => ({
      ...options,
      applied: true,
      presentationEffects: []
    }));
  });

  afterEach(() => Object.assign(generationServices, originals));

  test('automatically retries without rerunning pre_send or saving feedback', async () => {
    const activeCard = card(choicesRule());
    activeCard.rules = [{
      when: { phase: 'after_stream' },
      then: [{ type: 'state.set', path: 'summary.updated', value: true }]
    }];
    generationServices.prepareAfterStreamMessages = jest.fn(async options => ({
      ...options, applied: true, presentationEffects: []
    }));
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: true, card: activeCard, presentationEffects: []
    }));
    generationServices.sendChatRequest = jest.fn()
      .mockImplementationOnce(async (_request, callbacks) => callbacks.onToken('缺少选项'))
      .mockImplementationOnce(async (_request, callbacks) => (
        callbacks.onToken('<choices>A. 继续</choices>')
      ));
    const onValidationRetry = jest.fn();
    const { result, options } = renderRetryGeneration({
      retryBaseState: { score: 1 },
      options: { onValidationRetry }
    });

    await act(async () => { await result.current.retry(); });

    expect(generationServices.preparePreSendMessages).toHaveBeenCalledTimes(1);
    expect(generationServices.sendChatRequest).toHaveBeenCalledTimes(2);
    expect(generationServices.prepareAfterStreamMessages).toHaveBeenCalledTimes(1);
    expect(generationServices.sendChatRequest.mock.calls[1][0].messages.at(-1))
      .toEqual(expect.objectContaining({ role: 'system' }));
    expect(generationServices.sendChatRequest.mock.calls[1][0].messages.at(-1).content)
      .toContain('必须输出 choices 块');
    expect(onValidationRetry).toHaveBeenCalledWith(
      { score: 1 }, expect.objectContaining({ retryCount: 1 })
    );
    const accepted = options.setMessages.mock.calls.at(-1)[0];
    expect(accepted.at(-1).content).toBe('<choices>A. 继续</choices>');
    expect(accepted.some(message => message._meta?.source === 'response_validation_retry'))
      .toBe(false);
  });

  test('accepts warn failures, runs downstream flow and stores message metadata', async () => {
    const activeCard = card(choicesRule('warn'));
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: false, card: activeCard, presentationEffects: []
    }));
    generationServices.sendChatRequest = jest.fn(async (_request, callbacks) => (
      callbacks.onToken('没有选项')
    ));
    const onResponseValidationWarning = jest.fn();
    const { result, options } = renderRetryGeneration({
      options: { onResponseValidationWarning }
    });

    await act(async () => { await result.current.retry(); });

    expect(generationServices.sendChatRequest).toHaveBeenCalledTimes(1);
    expect(generationServices.prepareAfterResponseMessages).toHaveBeenCalledTimes(1);
    const accepted = options.setMessages.mock.calls.at(-1)[0];
    expect(accepted.at(-1)._meta.responseValidation.violations[0])
      .toEqual(expect.objectContaining({ id: 'choices', message: '必须输出 choices 块' }));
    expect(onResponseValidationWarning).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryExhausted: false })
    );
  });

  test('degrades the final failed retry to a warning', async () => {
    const activeCard = card(choicesRule(), 1);
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: false, card: activeCard, presentationEffects: []
    }));
    generationServices.sendChatRequest = jest.fn(async (_request, callbacks) => (
      callbacks.onToken('仍然没有选项')
    ));
    const onResponseValidationWarning = jest.fn();
    const { result } = renderRetryGeneration({
      options: { onResponseValidationWarning }
    });

    await act(async () => { await result.current.retry(); });

    expect(generationServices.sendChatRequest).toHaveBeenCalledTimes(2);
    expect(onResponseValidationWarning).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 1, retryExhausted: true })
    );
  });

  test('validates patches that arrive after visible content', async () => {
    const activeCard = card({
      id: 'score-update',
      type: 'state.update',
      path: 'score',
      updates: { eq: 1 },
      value: { eq: 2 },
      message: '必须更新 score'
    });
    activeCard.state = { schema: {
      score: { type: 'number', default: 0, llmWrite: true }
    } };
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: false, card: activeCard, presentationEffects: []
    }));
    generationServices.sendChatRequest = jest.fn(async (_request, callbacks) => {
      callbacks.onToken('正文。<state_patch>{"score":2}</state_patch>');
    });
    const { result, options } = renderRetryGeneration({ retryBaseState: { score: 0 } });

    await act(async () => { await result.current.retry(); });

    expect(generationServices.sendChatRequest).toHaveBeenCalledTimes(1);
    expect(options.setGameState).toHaveBeenCalledWith({ score: 2 });
    const accepted = options.setMessages.mock.calls.at(-1)[0];
    expect(accepted.at(-1).content).toContain('<state_patch>');
  });

  test('keeps the current retry attempt message id when it is stopped', async () => {
    const activeCard = card(choicesRule());
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: false, card: activeCard, presentationEffects: []
    }));
    generationServices.sendChatRequest = jest.fn()
      .mockImplementationOnce(async (_request, callbacks) => callbacks.onToken('无效回复'))
      .mockImplementationOnce(async (_request, callbacks) => {
        callbacks.onToken('部分回复');
        const error = new Error('stopped');
        error.name = 'AbortError';
        throw error;
      });
    const { result, options } = renderRetryGeneration();

    await act(async () => { await result.current.retry(); });

    const latestStreamId = options.typewriter.startStreaming.mock.calls.at(-1)[0];
    const completed = options.setMessages.mock.calls.at(-1)[0];
    expect(completed.at(-1)).toEqual(expect.objectContaining({
      id: latestStreamId,
      content: '部分回复'
    }));
  });

  test('keeps an empty response when its failed contract is accepted as warn', async () => {
    const activeCard = card(choicesRule('warn'));
    generationServices.preparePreSendMessages = jest.fn(async ({ messages, state }) => ({
      messages, state, applied: false, card: activeCard, presentationEffects: []
    }));
    generationServices.sendChatRequest = jest.fn(async () => {});
    const onResponseValidationWarning = jest.fn();
    const { result, options } = renderRetryGeneration({
      options: { onResponseValidationWarning }
    });

    await act(async () => { await result.current.retry(); });

    const completed = options.setMessages.mock.calls.at(-1)[0];
    expect(completed.at(-1).content).toBe('');
    expect(onResponseValidationWarning).toHaveBeenCalledWith(expect.objectContaining({
      violations: expect.any(Array)
    }));
  });
});
