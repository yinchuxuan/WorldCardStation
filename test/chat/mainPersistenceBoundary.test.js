import { renderHook, act } from '@testing-library/react';
import useChatPersistence from '../../src/renderer/chat/useChatPersistence.js';

test('internal main input cannot write an incomplete legacy Session format', async () => {
  const repository = { saveHistory: jest.fn() };
  const { result, rerender } = renderHook(({ messages }) => useChatPersistence({
    messages, gameState: {}, isLoading: false, repository, enabled: false
  }), { initialProps: { messages: [] } });
  act(() => result.current.markLoaded());
  rerender({ messages: [{ role: 'user', content: 'complete main input' }] });
  await result.current.flush();
  await expect(result.current.save()).rejects.toThrow('尚未接入存档');
  await expect(result.current.manual.save()).rejects.toThrow('不能保存');
  expect(result.current.manual.blocked).toBe(true);
  expect(repository.saveHistory).not.toHaveBeenCalled();
});
