export async function compileTavern(input, signal) {
  const { createTavernWorker } = await import('./tavernWorkerFactory.mjs');
  if (signal?.aborted) throw new Error('转换已取消');
  const worker = createTavernWorker();
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
      callback(value);
    };
    const cancel = () => finish(reject, new Error('转换已取消'));
    const timer = setTimeout(() => finish(reject, new Error('转换超时，请精简源卡')), 30000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => data.error ? finish(reject, new Error(data.error)) : finish(resolve, data.result);
    worker.onerror = event => finish(reject, new Error(event.message || '转换线程失败'));
    worker.postMessage(input);
  });
}
