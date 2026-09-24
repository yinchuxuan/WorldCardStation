import { createMainSessionView } from '../../src/renderer/gameCard/mainSessionView.js';

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
