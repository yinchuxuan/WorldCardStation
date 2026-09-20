import { createWebStore } from './storage.js';

export function createWebBackground(store = () => createWebStore('backgrounds'), urls = URL) {
  let current = null, currentBlob = null, queue = Promise.resolve();
  const listeners = new Set();
  const publish = (record) => {
    const previous = current?.backgroundImageUrl;
    const url = record.blob === currentBlob ? previous || '' : record.blob ? urls.createObjectURL(record.blob) : '';
    currentBlob = record.blob;
    current = { backgroundImageUrl: url, backgroundOpacity: record.opacity ?? 0.5 };
    listeners.forEach(listener => listener({ ...current }));
    if (previous && previous !== url) urls.revokeObjectURL(previous);
    return { ...current };
  };
  const load = async () => {
    await queue;
    return current ? { ...current } : publish(await store().get('current') || {});
  };
  const write = (operation) => {
    const task = queue.then(async () => {
      const record = await operation(await store().get('current') || {});
      await store().put({ ...record, key: 'current' });
      return publish(record);
    });
    queue = task.catch(() => {});
    return task;
  };
  return {
    load,
    save: value => write(record => ({ ...record, blob: value.backgroundImageUrl ? record.blob : null,
      opacity: Number.isFinite(value.backgroundOpacity) ? Math.max(0, Math.min(1, value.backgroundOpacity)) : 0.5 })),
    async setImage(file) {
      if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
        throw new Error('请选择 20 MB 以内的 PNG、JPEG、WebP、GIF 或 BMP 图片');
      }
      return write(record => ({ ...record, blob: file }));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { if (current?.backgroundImageUrl) urls.revokeObjectURL(current.backgroundImageUrl); current = null; currentBlob = null; }
  };
}
export const webBackground = createWebBackground();
