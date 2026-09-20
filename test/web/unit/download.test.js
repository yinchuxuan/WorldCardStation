import { boundedBytes, checkAbort, runDownloads } from '../../../src/web/cache/download.js';

const response = chunks => ({ ok: true, body: new ReadableStream({ start(controller) {
  chunks.forEach(chunk => controller.enqueue(new Uint8Array(chunk))); controller.close();
} }) });
test('bounded download checks HTTP, byte limit and abort', async () => {
  expect([...await boundedBytes(response([[1], [2, 3]]), 3)]).toEqual([1, 2, 3]);
  await expect(boundedBytes(response([[1, 2]]), 1)).rejects.toThrow('超过');
  await expect(boundedBytes({ ok: false, status: 404 }, 1)).rejects.toThrow('404');
  const controller = new AbortController(); controller.abort();
  expect(() => checkAbort(controller.signal)).toThrow('取消');
  await expect(boundedBytes(response([[1]]), 1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
test('download queue stays bounded and completes all files', async () => {
  let active = 0, peak = 0;
  const seen = [];
  await runDownloads([1, 2, 3, 4, 5], async item => {
    active += 1; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    seen.push(item); active -= 1;
  }, new AbortController());
  expect(peak).toBe(2); expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
});
test('queue aborts peers and waits for in-flight tasks on first failure', async () => {
  const controller = new AbortController(); let finished = false;
  await expect(runDownloads([1, 2, 3], async item => {
    if (item === 1) { await Promise.resolve(); throw new Error('broken'); }
    await new Promise(resolve => setTimeout(resolve, 1)); finished = true;
  }, controller)).rejects.toThrow('broken');
  expect(controller.signal.aborted).toBe(true); expect(finished).toBe(true);
});
