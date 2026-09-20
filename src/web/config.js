import { createWebStore } from './storage.js';

export function createWebConfig(store = () => createWebStore('settings')) {
  let current = null, queue = Promise.resolve();
  const load = async () => {
    await queue;
    if (!current) {
      const saved = (await store().get('model'))?.value || {};
      current = { ...saved, apiKey: saved.apiKey || '' };
      delete current.rememberKey;
    }
    return { ...current };
  };
  return {
    load,
    save(value) {
      const next = { ...value };
      delete next.rememberKey;
      const task = queue.then(async () => {
        const stored = { ...next };
        await store().put({ key: 'model', value: stored });
        current = next;
        return { ...current };
      });
      queue = task.catch(() => {});
      return task;
    }
  };
}
export const webConfig = createWebConfig();
