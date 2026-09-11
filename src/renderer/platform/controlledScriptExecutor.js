import { getExecFileEntries } from '../gameCard/execFiles.js';
import { scriptWorkerSource } from './scriptWorkerSource.js';
import { assertBrowserExecSource } from '../../shared/game-card/exec/execCompilation.js';

const DEFAULT_EXEC_TIMEOUT_MS = 2000;

function blockedGlobals() {
  return `
      const require = undefined;
      const process = undefined;
      const window = undefined;
      const document = undefined;
      const fetch = undefined;
      const ipcRenderer = undefined;
  `;
}

function buildNodeSource(source, isSourceFile) {
  if (isSourceFile) {
    return `(function () {
      'use strict';
      ${blockedGlobals()}
      ${source}
      if (typeof run !== 'function') throw new Error('exec sourceFile must define function run(ctx)');
      return run(__ctx);
    })()`;
  }
  return `(function () {
    'use strict';
    ${blockedGlobals()}
    const ctx = __ctx;
    const { messages, state, config, event, args, utils, files } = ctx;
    ${source}
  })()`;
}

function runInNode(source, context, options) {
  const globalRequire = require;
  const vm = globalRequire('vm');
  const sandbox = { __ctx: context };
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  return vm.runInContext(buildNodeSource(source, options.isSourceFile), sandbox, {
    timeout: options.timeoutMs
  });
}

function enforceAsyncTimeout(result, timeoutMs) {
  if (!result || typeof result.then !== 'function') return result;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Script execution timed out')), timeoutMs);
    const finish = callback => (value) => {
      clearTimeout(timer);
      callback(value);
    };
    Promise.resolve(result).then(finish(resolve), finish(reject));
  });
}

function createBrowserWorker() {
  const url = URL.createObjectURL(new Blob([scriptWorkerSource], { type: 'text/javascript' }));
  return { worker: new Worker(url), release: () => URL.revokeObjectURL(url) };
}

function serializableContext(context) {
  const { messages, state, config, event, args } = context;
  return { messages, state, config, event, args };
}

function runInBrowser(source, context, options) {
  try { assertBrowserExecSource(source); } catch (error) { return Promise.reject(error); }
  const created = (options.workerFactory || createBrowserWorker)();
  const worker = created.worker || created;
  const release = created.release || (() => {});
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      release();
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('Script execution timed out')), options.timeoutMs);
    worker.onmessage = ({ data }) => {
      if (data?.type === 'file.read') {
        Promise.resolve()
          .then(() => context.files.readText(data.scopeId, data.relativePath))
          .then((content) => {
            if (!settled) worker.postMessage({ type: 'file.response', requestId: data.requestId, content });
          })
          .catch((error) => {
            if (!settled) worker.postMessage({ type: 'file.response', requestId: data.requestId, error: error.message });
          });
        return;
      }
      if (data.error) finish(reject, new Error(data.error));
      else finish(resolve, data.result);
    };
    worker.onerror = (event) => finish(reject, new Error(event.message || 'Script worker failed'));
    worker.postMessage({
      source,
      isSourceFile: options.isSourceFile,
      context: serializableContext(context),
      files: getExecFileEntries(context.files)
    });
  });
}

function run(source, context, options = {}) {
  const runtimeOptions = {
    timeoutMs: options.timeoutMs || DEFAULT_EXEC_TIMEOUT_MS,
    isSourceFile: !!options.isSourceFile,
    workerFactory: options.workerFactory
  };
  const canUseNodeVm = typeof require === 'function' && typeof process !== 'undefined';
  if (!canUseNodeVm) return runInBrowser(source, context, runtimeOptions);
  return enforceAsyncTimeout(runInNode(source, context, runtimeOptions), runtimeOptions.timeoutMs);
}

const controlledScriptExecutor = { run };

export { controlledScriptExecutor, DEFAULT_EXEC_TIMEOUT_MS, runInBrowser };
