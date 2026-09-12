/**
 * Tests for useTypewriter hook thinking parsing
 */

const { renderHook, act } = require('@testing-library/react');
const useTypewriter = require('../../src/renderer/chat/useTypewriter.js').default;

describe('useTypewriter thinking parsing', () => {
  test('should separate thinking content from regular content', () => {
    const { result } = renderHook(() => useTypewriter());

    act(() => { result.current.startStreaming(); });
    act(() => { result.current.pushContent('<thinking>Let me think'); });

    expect(result.current.thinkingContent).toBe('Let me think');

    let appended = '';
    act(() => { appended = result.current.pushContent('</thinking>Here is the answer'); });

    expect(result.current.thinkingContent).toBe('Let me think');
    expect(result.current.thinkingDone).toBe(true);
    expect(result.current.streamContent).toBe('Here is the answer');
    expect(appended).toBe('Here is the answer');
  });

  test('should handle thinking tag split across chunks', () => {
    const { result } = renderHook(() => useTypewriter());

    act(() => { result.current.startStreaming(); });
    let appended = '';
    act(() => { appended = result.current.pushContent('<thinking>'); });
    expect(appended).toBe('');
    act(() => { result.current.pushContent('Thinking here'); });
    act(() => { result.current.pushContent('</thinking>'); });
    act(() => { appended = result.current.pushContent('Response text'); });

    expect(result.current.thinkingContent).toBe('Thinking here');
    expect(result.current.thinkingDone).toBe(true);
    expect(result.current.streamContent).toBe('Response text');
    expect(appended).toBe('Response text');
  });
});
