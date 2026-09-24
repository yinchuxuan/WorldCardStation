/**
 * Tests for useTypewriter hook thinking parsing
 */

const { renderHook, act } = require('@testing-library/react');
const useTypewriter = require('../../src/renderer/chat/useTypewriter.js').default;

describe('useTypewriter thinking parsing', () => {
  test('keeps protocol content in the raw response without showing it, and clears both for a new stream', () => {
    const { result } = renderHook(() => useTypewriter());
    const patch = '<state_patch>{"score":1}</state_patch>';
    act(() => {
      result.current.startStreaming('first');
      result.current.pushContent('before');
      result.current.pushProtocolContent(patch);
      result.current.pushContent('after');
      result.current.finishStreaming();
    });
    expect(result.current.streamContent).toBe('beforeafter');
    expect(result.current.getRawContent()).toBe(`before${patch}after`);
    act(() => result.current.startStreaming('next'));
    expect(result.current.streamContent).toBe('');
    expect(result.current.getRawContent()).toBe('');
  });

  test('should separate thinking content from regular content', () => {
    const { result } = renderHook(() => useTypewriter());

    act(() => { result.current.startStreaming(); });
    act(() => { result.current.pushContent('<thinking>Let me think'); });

    expect(result.current.thinkingContent).toBe('Let me think');

    let appended = '';
    act(() => { appended = result.current.pushContent('</thinking>Here is the answer'); });

    expect(result.current.thinkingContent).toBe('Let me think');
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
    expect(result.current.streamContent).toBe('Response text');
    expect(appended).toBe('Response text');
    act(() => { result.current.pushContent('<thinking>literal</thinking>'); result.current.finishStreaming(); });
    expect(result.current.streamContent).toBe('Response text<thinking>literal</thinking>');
    expect(result.current.thinkingContent).toBe('Thinking here');
  });
});
