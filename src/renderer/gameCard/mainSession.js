import { createAgentRuntime } from '../../shared/game-card/runtime/agentRuntime.js';
import { cloneJson, deepFreeze } from '../../shared/game-card/utils/jsonValue.js';
import { loadMainProgram } from './mainProgram.js';
import { runMainWorker } from '../platform/mainWorkerHost.js';
import { createMainSessionView } from './mainSessionView.js';

// One instance per Session; replacing/unloading it must dispose the old instance first.
function createMainSession({ definition, readText, generate, workerFactory, timeoutMs }) {
  let current = { ...createAgentRuntime({ definition, generate }).snapshot(), records: [] };
  const view = createMainSessionView(current);
  let program, active, retryBase, disposed = false, sequence = 0;
  function run(input, baseline, retry = false) {
    if (disposed) return Promise.reject(new Error('game Session disposed'));
    if (active) return Promise.reject(new Error('another input is still running'));
    if (typeof input !== 'string') return Promise.reject(new Error('input must be a string'));
    const controller = new AbortController();
    const token = { controller };
    active = token;
    view.reset(baseline, 'start', { retry });
    retryBase = { input, snapshot: cloneJson(baseline) };
    const idPrefix = `round-${++sequence}-`;
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new Error('input cancelled'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const execute = async () => {
      program ||= loadMainProgram(definition, readText);
      const loaded = await program;
      if (controller.signal.aborted) throw new Error('input cancelled');
      return runMainWorker({ workerFactory, program: loaded, input, snapshot: baseline, idPrefix,
        generate, readText, signal: controller.signal, timeoutMs,
        display: view.display, onUpdate: view.update });
    };
    token.done = Promise.race([execute(), aborted]).then(result => {
      if (disposed || active !== token || controller.signal.aborted) throw new Error('input context expired');
      current = cloneJson(result);
      view.reset(current, 'complete');
      return deepFreeze(cloneJson(current));
    }).catch(error => {
      current = cloneJson(baseline);
      view.reset(current, 'rollback');
      throw error;
    }).finally(() => {
      controller.signal.removeEventListener('abort', onAbort);
      if (active === token) active = undefined;
    });
    token.done.catch(() => {});
    return token.done;
  }
  async function cancel() {
    const token = active;
    token?.controller.abort();
    await token?.done.catch(() => {});
  }
  return Object.freeze({
    send: input => run(input, current),
    retry(input = retryBase?.input) {
      if (!retryBase) return Promise.reject(new Error('no input to retry'));
      return run(input, retryBase.snapshot, true);
    },
    snapshot: () => deepFreeze(cloneJson(current)),
    view: view.get,
    subscribe: view.subscribe,
    advance: view.next,
    get running() { return Boolean(active); },
    cancel,
    async dispose() { disposed = true; await cancel(); }
  });
}

export { createMainSession };
