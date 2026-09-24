import { act } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import { runtimeTrace } from '../../src/renderer/trace/runtimeTrace.js';
import { renderRetryGeneration } from './useChatGenerationTestHarness.js';

const activeCard = { id: 'trace-play', name: 'Trace', version: '1', rules: [], state: { schema: {
  score: { type: 'number', default: 0, llmWrite: true }
} } };
const events = () => global.platformMock.appendSessionTrace.mock.calls.flatMap(([, records]) => records);

beforeEach(async () => {
  await runtimeTrace.enable(false);
  await runtimeTrace.bind({ cardId: activeCard.id, sessionId: 'test' }, [], { score: 0 });
  global.platformMock.getActiveGameCard.mockResolvedValue(activeCard);
  global.platformMock.appendSessionTrace.mockClear();
  await runtimeTrace.enable(true);
});
afterEach(async () => {
  await act(async () => { await runtimeTrace.enable(false); });
  jest.restoreAllMocks();
});

test('response validation preserves actual patch attempts and rolls back before regenerating', async () => {
  const card = { ...activeCard, responseValidation: { maxRetries: 1, rules: [{
    id: 'choices', type: 'content.regex', pattern: 'PASS', matches: { eq: 1 }, onFailure: 'retry', message: 'PASS required'
  }] } };
  global.platformMock.getActiveGameCard.mockResolvedValue(card);
  jest.spyOn(generationServices, 'sendChatRequest')
    .mockImplementationOnce(async (_, callbacks) => { await callbacks.onToken('<state_patch>{"score":3}</state_patch>FAIL'); })
    .mockImplementationOnce(async (_, callbacks) => { await callbacks.onToken('<state_patch>{"score":5}</state_patch>PASS'); });
  const { result, options } = renderRetryGeneration({ retryBaseState: { score: 0 } });
  await act(async () => { await result.current.retry(); });
  await runtimeTrace.flush();
  const output = events();
  const generation = output.find(event => event.type === 'operation.start' && event.kind === 'generation');
  expect(output.filter(event => event.type === 'operation.start' && event.kind === 'state_patch'))
    .toEqual([expect.objectContaining({ parentOperationId: generation.operationId, origin: 'stream', patchOrdinal: 0 }),
      expect.objectContaining({ parentOperationId: generation.operationId, origin: 'stream', patchOrdinal: 0 })]);
  expect(output.find(event => event.type === 'validation.rollback').changes.state)
    .toContainEqual({ path: '/score', before: 3, after: 0 });
  expect(output.filter(event => event.type === 'response.validation').map(event => event.result.action))
    .toEqual(['retry', null]);
  expect(output.filter(event => event.type === 'response.validation').at(-1).result.violations).toEqual([]);
  expect(options.setGameState).toHaveBeenLastCalledWith({ score: 5 });
  expect(JSON.stringify(output)).not.toContain('http://api.example.com');
  expect(output.find(event => event.type === 'model.request')).not.toHaveProperty('apiKey');
});

test.each(['Error', 'AbortError'])('logs request failure versus partial acceptance for %s', async name => {
  jest.spyOn(generationServices, 'sendChatRequest').mockImplementation(async (_, callbacks) => {
    await callbacks.onToken('<state_patch>{"score":3}</state_patch>partial');
    const error = Error('stopped'); error.name = name; throw error;
  });
  const { result, options } = renderRetryGeneration({ retryBaseState: { score: 0 } });
  await act(async () => { await result.current.retry(); });
  await runtimeTrace.flush();
  const output = events();
  if (name === 'Error') {
    expect(output.find(event => event.type === 'generation.rollback').changes.state)
      .toContainEqual({ path: '/score', before: 3, after: 0 });
    expect(options.setGameState).toHaveBeenLastCalledWith({ score: 0 });
  } else {
    expect(output.find(event => event.type === 'generation.abort').status).toBe('partial_committed');
    expect(options.setGameState).toHaveBeenLastCalledWith({ score: 3 });
  }
});

test('continuous validation logs the applied patch, not a deferred candidate', async () => {
  global.platformMock.getActiveGameCard.mockResolvedValue({ ...activeCard,
    responseValidation: { rules: [{ id: 'score', type: 'state.update', path: 'score', updates: { eq: 1 }, value: { eq: 2 }, message: 'score' }] } });
  jest.spyOn(generationServices, 'sendChatRequest').mockImplementation(async (_, callbacks) => {
    await callbacks.onToken('body<state_patch>{"score":2}</state_patch>');
  });
  const { result, options } = renderRetryGeneration({ retryBaseState: { score: 0 } });
  await act(async () => { await result.current.retry(); });
  await runtimeTrace.flush();
  const output = events();
  expect(output.some(event => event.kind === 'state_patch')).toBe(true);
  expect(output.find(event => event.type === 'model.response').validationCandidate).toBeUndefined();
  expect(options.setGameState).toHaveBeenCalledWith({ score: 2 });
});
