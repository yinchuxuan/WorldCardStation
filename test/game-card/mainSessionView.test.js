import { createMainSessionView } from '../../src/renderer/gameCard/mainSessionView.js';

test.each(['continuous', 'segmented'])('pending input waits for this round present text (%s)', async mode => {
  const baseline = { records: [{ id: 'old', content: '上一轮正文' }] };
  const store = createMainSessionView(baseline);
  const signal = new AbortController().signal;
  expect(store.get().pendingInput).toBeNull();
  store.reset(baseline, 'start', { startup: true, input: '' });
  expect(store.get().pendingInput).toBeNull();
  store.reset(baseline, 'start', { input: '本轮输入' });
  store.update(baseline, { type: 'reading-patch' });
  expect(store.get().pendingInput).toBe('本轮输入');
  async function display(content) {
    const result = store.display({ view: { records: [...baseline.records, { id: 'new', content }] },
      recordId: 'new', mode }, signal);
    if (mode === 'segmented') store.next();
    await result;
  }
  await display('  ');
  expect(store.get().pendingInput).toBe('本轮输入');
  await display('新正文');
  expect(store.get().pendingInput).toBeNull();
  store.update(baseline, { type: 'read-complete' });
  expect(store.get().pendingInput).toBeNull();
  for (const type of ['complete', 'rollback', 'loading', 'restore']) {
    store.reset(baseline, 'start', { retry: true, input: '重新输入' });
    expect(store.get().pendingInput).toBe('重新输入');
    store.reset(baseline, type);
    expect(store.get().pendingInput).toBeNull();
  }
});

test('segmented display waits for acknowledgement, continuous does not; reset fences late advances', async () => {
  const store = createMainSessionView({ state: {}, records: [] });
  const listener = jest.fn(), unsubscribe = store.subscribe(listener);
  const controller = new AbortController();
  let completed = false;
  const work = store.display({ view: { state: { n: 1 }, records: [] }, mode: 'segmented', recordId: 'r1' }, controller.signal)
    .then(() => { completed = true; });
  expect(store.get().reading.recordId).toBe('r1');
  expect(completed).toBe(false);
  expect(store.next()).toBe(true);
  expect(store.next()).toBe(false);
  await work;
  await store.display({ view: { state: { n: 2 }, records: [] }, mode: 'continuous' }, controller.signal);
  expect(store.get().state.n).toBe(2);
  expect(Object.isFrozen(store.get().state)).toBe(true);
  const canceled = store.display({ view: { state: {}, records: [] }, mode: 'segmented' }, controller.signal);
  controller.abort();
  await expect(canceled).rejects.toThrow('cancelled');
  store.reset({ state: {}, records: [] }, 'rollback');
  expect(store.next()).toBe(false);
  await expect(store.display({}, controller.signal)).rejects.toThrow('cancelled');
  unsubscribe();
  expect(listener).toHaveBeenCalled();
});
