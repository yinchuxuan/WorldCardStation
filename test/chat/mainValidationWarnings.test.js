import { act, renderHook } from '@testing-library/react';
import useMainGeneration from '../../src/renderer/chat/useMainGeneration.js';

function session() {
  const listeners = new Set(), view = { state: {}, messages: [], records: [], contexts: {} };
  return { running: true, snapshot: () => view, dispose: jest.fn(),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(detail) { listeners.forEach(fn => fn(view, detail)); }
  };
}
test('main warnings publish during reading, accumulate per Agent, and do not reopen on later updates', () => {
  const main = session(), warn = jest.fn();
  const props = { mainSession: main, persistence: {}, setMessages: jest.fn(), setGameState: jest.fn(),
    setIsLoading: jest.fn(), onResponseValidationWarning: warn };
  const { rerender } = renderHook(({ runtime }) => useMainGeneration({ ...props, mainSession: runtime }),
    { initialProps: { runtime: main } });
  const event = { type: 'agent-response', agentId: 'narrator', messageId: 'r1',
    warnings: [{ id: 'choices', message: 'choices 格式错误', onFailure: 'warn' }] };
  act(() => main.emit(event));
  expect(warn).toHaveBeenLastCalledWith({ retryExhausted: false,
    violations: [{ ...event.warnings[0], agentId: 'narrator' }] });
  expect(main.running).toBe(true);
  warn.mockClear(); // Simulate dismissing the notice; unrelated updates must not show it again.
  act(() => { main.emit({ type: 'display' }); main.emit(event); main.emit({ type: 'complete' }); });
  expect(warn).not.toHaveBeenCalled();
  act(() => main.emit({ ...event, agentId: 'judge', messageId: 'r2' }));
  expect(warn.mock.lastCall[0].violations.map(item => item.agentId)).toEqual(['narrator', 'judge']);
  act(() => main.emit({ type: 'start', retry: true }));
  expect(warn).toHaveBeenLastCalledWith(null);
  act(() => main.emit({ ...event, messageId: 'retry1' }));
  expect(warn.mock.lastCall[0].violations).toHaveLength(1);
  act(() => main.emit({ type: 'restore' }));
  expect(warn).toHaveBeenLastCalledWith(null);
  rerender({ runtime: session() });
  warn.mockClear();
  act(() => main.emit({ ...event, messageId: 'late' }));
  expect(warn).not.toHaveBeenCalled();
});
