import { act, renderHook } from '@testing-library/react';
import useReadingStatePatches from '../../../src/renderer/chat/useReadingStatePatches.js';
import useSegmentedReading from '../../../src/renderer/chat/useSegmentedReading.js';

test('reading callback remains stable across save-status renders and releases its operation lock', async () => {
  const end = jest.fn(), beginOperation = jest.fn(() => end);
  const props = { card: null, messages: [], state: {}, setMessages: jest.fn(), setState: jest.fn(),
    scopeKey: 0, beginOperation, typewriter: { getAppliedPatchCount: () => 0, markPatchApplied: jest.fn() } };
  const { result, rerender } = renderHook(value => useReadingStatePatches(value), { initialProps: props });
  const callback = result.current;
  rerender({ ...props, typewriter: { ...props.typewriter } });
  expect(result.current).toBe(callback);
  await act(() => result.current({}));
  expect(beginOperation).toHaveBeenCalledTimes(1);
  expect(end).toHaveBeenCalledTimes(1);
});
test('initialization streaming placeholder cannot consume the saved reading position', () => {
  const props = { enabled: true, isLoading: true, messages: [], scopeKey: 1, restoreToken: 2,
    restorePosition: { messageId: 'reply', segmentIndex: 1 } };
  const { result, rerender } = renderHook(value => useSegmentedReading(value), { initialProps: props });
  expect(result.current.pageIndex).toBe(0);
  rerender({ ...props, isLoading: false, messages: [{ id: 'reply', role: 'assistant', content: 'first\n\nsecond' }] });
  expect(result.current.pageIndex).toBe(1);
});
