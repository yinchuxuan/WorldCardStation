import { act, renderHook } from '@testing-library/react';
import useChatPersistence from '../../../src/renderer/chat/useChatPersistence.js';
jest.mock('@platform', () => ({ savePolicy: 'manual', rendererServices: { sessions: {} } }));
function fixture(saveHistory = jest.fn(async () => ({ saveTarget: { id: 'a', revision: 1 }, savedAt: '2026-09-20' }))) {
  const repository = { saveHistory };
  const hook = renderHook(props => useChatPersistence({ ...props, repository }), {
    initialProps: { messages: [], gameState: {}, isLoading: false }
  });
  act(() => { hook.result.current.hydrate({ messages: [], saveTarget: { id: 'a', revision: 0 } }); hook.result.current.markLoaded(); });
  return { ...hook, repository };
}
test('dirty tracks messages, state, reading and retry base; saving binds the complete snapshot', async () => {
  const { result, rerender, repository } = fixture();
  expect(result.current.manual.dirty).toBe(false);
  rerender({ messages: [{ id: 'm', content: 'hello' }], gameState: { score: 2 }, isLoading: false });
  act(() => { result.current.setRetryBase([{ content: 'before' }], { score: 1 });
    result.current.setReadingPosition({ messageId: 'm', segmentIndex: 1 }); });
  expect(result.current.manual.dirty).toBe(true);
  await act(() => result.current.save());
  expect(repository.saveHistory).toHaveBeenCalledWith([{ id: 'm', content: 'hello' }], expect.objectContaining({
    asNew: true, gameState: { score: 2 }, retryBaseState: { score: 1 }, viewState: { reading: { messageId: 'm', segmentIndex: 1 } }
  }));
  expect(result.current.manual.dirty).toBe(false);
});
test('edits during save remain dirty and failed explicit saves preserve pending progress', async () => {
  let resolve;
  const { result, rerender, repository } = fixture(jest.fn(() => new Promise(done => { resolve = done; })));
  rerender({ messages: [{ content: 'one' }], gameState: {}, isLoading: false });
  let task;
  act(() => { task = result.current.save(); });
  rerender({ messages: [{ content: 'two' }], gameState: {}, isLoading: false });
  await act(async () => { resolve({ saveTarget: { id: 'a', revision: 1 } }); await task; });
  expect(result.current.manual.dirty).toBe(true);
  repository.saveHistory.mockRejectedValue(new Error('quota'));
  await act(async () => { await expect(result.current.save()).rejects.toThrow('quota'); });
  expect(result.current.manual.error.message).toBe('quota');
  expect(result.current.manual.dirty).toBe(true);
  expect(repository.saveHistory.mock.calls[1][0]).toEqual([{ content: 'two' }]);
});
test('loading, state operations, restore failure and revision conflict prevent unsafe saves', async () => {
  const { result, rerender, repository } = fixture();
  rerender({ messages: [], gameState: {}, isLoading: true });
  await expect(result.current.save()).rejects.toThrow('尚未稳定');
  rerender({ messages: [], gameState: {}, isLoading: false });
  let end;
  act(() => { end = result.current.manual.beginOperation(); });
  expect(result.current.manual.blocked).toBe(true);
  act(() => end());
  repository.saveHistory.mockRejectedValue(Object.assign(new Error('conflict'), { code: 'SESSION_CONFLICT' }));
  await act(async () => { await expect(result.current.save()).rejects.toThrow('conflict'); });
  expect(result.current.manual.canMutate()).toBe(false);
  act(() => result.current.reset());
  await expect(result.current.save()).rejects.toThrow('尚未成功加载');
});
test('dirty sessions leave immediately without saving and lock mutations until switching finishes', async () => {
  const { result, rerender, repository } = fixture();
  rerender({ messages: [{ content: 'pending' }], gameState: {}, isLoading: false });
  let leaving;
  act(() => { leaving = result.current.manual.requestLeave(); });
  await expect(leaving).resolves.toBe(true);
  expect(repository.saveHistory).not.toHaveBeenCalled();
  expect(result.current.manual.canMutate()).toBe(false);
  act(() => result.current.manual.endLeave());
  expect(result.current.manual.canMutate()).toBe(true);
});
test('leaving is blocked while state operations are running', async () => {
  const { result } = fixture();
  let end;
  act(() => { end = result.current.manual.beginOperation(); });
  await expect(result.current.manual.requestLeave()).resolves.toBe(false);
  act(() => end());
});
