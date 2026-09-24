import { createMainSession } from '../gameCard/mainSession.js';

export function createMainWorker() {
  return new Worker(new URL('./mainRuntime.worker.js', import.meta.url), { type: 'module' });
}

export function createBrowserMainSession(options) {
  return createMainSession({ ...options, workerFactory: createMainWorker });
}
