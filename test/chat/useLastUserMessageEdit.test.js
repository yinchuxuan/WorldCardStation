import { act, renderHook } from '@testing-library/react';
import useLastUserMessageEdit from '../../src/renderer/chat/useLastUserMessageEdit.js';

describe('useLastUserMessageEdit', () => {
  test('exposes the latest user action without the hidden turn context', () => {
    const messages = [
      { role: 'user', content: '旧行动' },
      { role: 'assistant', content: '剧情' },
      {
        role: 'user',
        content: '去第三音乐室。\n\n---\n\n<wa2_turn_context>隐藏引导</wa2_turn_context>'
      }
    ];

    const { result } = renderHook(() => useLastUserMessageEdit({ messages, isLoading: true,
      retryBaseMessages: [...messages.slice(0, 2), { role: 'user', content: '去第三音乐室。' }] }));

    expect(result.current.retrySource).toBe('去第三音乐室。');
  });

  test('keeps arbitrary text when no retry snapshot is available', () => {
    const content = 'raw\n---\n<wa2_turn_context>literal</wa2_turn_context>';
    const { result } = renderHook(() => useLastUserMessageEdit({ messages: [{ role: 'user', content }] }));
    expect(result.current.retrySource).toBe(content);
    act(() => result.current.start(0));
    expect(result.current.content).toBe(content);
  });

  test('does not use the snapshot of a different user message', () => {
    const { result } = renderHook(() => useLastUserMessageEdit({
      messages: [{ id: 'new', role: 'user', content: 'new input' }],
      retryBaseMessages: [{ id: 'old', role: 'user', content: 'old input' }]
    }));
    expect(result.current.retrySource).toBe('new input');
  });
});
