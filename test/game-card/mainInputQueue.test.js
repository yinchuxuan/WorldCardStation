import { createMainInputQueue } from '../../src/renderer/gameCard/mainInputQueue.js';
import { barrier } from './agentRuntimeHelpers.js';

test('FIFO never overlaps tasks and is idle when the last completion resolves', async () => {
  const gate = barrier(), entered = barrier(), order = [];
  const queue = createMainInputQueue({ cancel: jest.fn(), notify: jest.fn() });
  const first = queue.enqueue(async () => { order.push('first'); entered.resolve(); await gate.promise; order.push('end'); });
  const second = queue.enqueue(() => order.push('second'));
  await entered.promise;
  expect(queue.pendingCount).toBe(1);
  expect(order).toEqual(['first']);
  gate.resolve();
  await Promise.all([first, second]);
  expect(order).toEqual(['first', 'end', 'second']);
  expect(queue.busy).toBe(false);
});

test('reset before the first task starts fences it and discards pending work', async () => {
  const task = jest.fn(), queue = createMainInputQueue({ cancel: jest.fn(), notify: jest.fn() });
  const first = queue.enqueue(task), second = queue.enqueue(task);
  await queue.reset();
  await expect(first).rejects.toMatchObject({ code: 'INPUT_DISCARDED' });
  await expect(second).rejects.toMatchObject({ code: 'INPUT_DISCARDED' });
  expect(task).not.toHaveBeenCalled();
  expect(queue.busy).toBe(false);
});

test('failure pauses pending work; explicit reset discards it before retry', async () => {
  const task = jest.fn(), queue = createMainInputQueue({ cancel: jest.fn(), notify: jest.fn() });
  const failed = queue.enqueue(() => { throw Error('failed'); });
  const pending = queue.enqueue(task);
  await expect(failed).rejects.toThrow('failed');
  expect(queue.paused).toBe(true);
  expect(queue.pendingCount).toBe(1);
  await expect(queue.enqueue(task)).rejects.toThrow('paused');
  await queue.reset(() => task('retry'));
  await expect(pending).rejects.toMatchObject({ code: 'INPUT_DISCARDED' });
  expect(task).toHaveBeenCalledTimes(1);
  expect(task).toHaveBeenCalledWith('retry');
  expect(queue.busy).toBe(false);
});
