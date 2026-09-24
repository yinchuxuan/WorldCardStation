import { buildSync } from 'esbuild';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { createMainSession } from '../../src/renderer/gameCard/mainSession.js';

function buildMainWorkerFactory() {
  const built = buildSync({ entryPoints: [path.resolve('src/renderer/platform/mainRuntime.worker.js')],
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', logLevel: 'silent' });
  const source = built.outputFiles[0].text;
  return () => {
    const worker = new Worker(`
      const { parentPort } = require('node:worker_threads');
      const vm = require('node:vm');
      const realm = vm.createContext({
        postMessage: data => parentPort.postMessage(data),
        addEventListener: (_, callback) => parentPort.on('message', data => callback({data}))
      });
      vm.runInContext(\`
        globalThis.AbortSignal = class {
          aborted = false; listeners = new Set();
          addEventListener(_, fn) { this.listeners.add(fn); }
          removeEventListener(_, fn) { this.listeners.delete(fn); }
        };
        globalThis.AbortController = class {
          signal = new AbortSignal();
          abort() { this.signal.aborted = true; this.signal.listeners.forEach(fn => fn()); }
        };
      \`, realm);
      vm.runInContext(${JSON.stringify(source)}, realm);
    `, { eval: true });
    const adapter = { postMessage: data => worker.postMessage(data), terminate: () => worker.terminate() };
    worker.on('message', data => adapter.onmessage?.({ data }));
    worker.on('error', error => adapter.onerror?.(error));
    return adapter;
  };
}

function testMainSession(workerFactory, source, generate, options = {}) {
  const definition = {
    card: { id: 'test', files: {} }, main: { path: 'main.js', source },
    stateSchema: { count: { type: 'number', default: 0 }, verdict: { type: 'string' } },
    agents: Object.fromEntries(['judge', 'narrator'].map(id => [id, { definition: { model: 'default', rules: [] } }])),
    ...options.definition
  };
  return createMainSession({ definition, workerFactory, generate,
    readText: async path => { if (options.files?.[path] !== undefined) return options.files[path]; throw new Error(`missing ${path}`); },
    timeoutMs: options.timeoutMs || 300 });
}

export { buildMainWorkerFactory, testMainSession };
