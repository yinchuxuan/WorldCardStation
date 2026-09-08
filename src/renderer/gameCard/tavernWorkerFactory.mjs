export function createTavernWorker() {
  return new Worker(new URL('./tavernCompiler.worker.js', import.meta.url), { type: 'module' });
}
