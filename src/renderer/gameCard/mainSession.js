import { createAgentRuntime } from '../../shared/game-card/runtime/agentRuntime.js';
import { cloneJson, deepFreeze } from '../../shared/game-card/utils/jsonValue.js';
import { loadMainProgram } from './mainProgram.js';
import { runMainWorker } from '../platform/mainWorkerHost.js';
import { createMainSessionView } from './mainSessionView.js';
import { validateRuntimeSession } from '../../shared/game-card/runtime/sessionSnapshot.js';

// One instance per Session; replacing/unloading it must dispose the old instance first.
function createMainSession({ definition, readText, generate, workerFactory, timeoutMs }) {
  const empty = () => ({ ...createAgentRuntime({ definition, generate }).snapshot(), records: [], messages: [] });
  let current = empty(), viewState = {}, ready = true;
  const view = createMainSessionView(current);
  let program, active, retryBase, disposed = false, sequence = 0;
  function run(input, baseline, retry = false) {
    if (disposed) return Promise.reject(new Error('game Session disposed'));
    if (!ready) return Promise.reject(new Error('Session 尚未成功加载'));
    if (active) return Promise.reject(new Error('another input is still running'));
    if (typeof input !== 'string') return Promise.reject(new Error('input must be a string'));
    const controller = new AbortController();
    const token = { controller };
    active = token;
    const baselineView = retry ? retryBase.viewState : cloneJson(viewState);
    viewState = cloneJson(baselineView);
    view.reset(baseline, 'start', { retry });
    retryBase = { input, snapshot: cloneJson(baseline), viewState: baselineView };
    const idPrefix = `round-${++sequence}-`;
    const user = { id: `user-${idPrefix}`, role: 'user', content: input };
    const existing = new Set(baseline.records.map(record => record.id));
    const visible = result => ({ ...result, messages: [...baseline.messages, user,
      ...result.records.filter(record => !existing.has(record.id) && record.content)] });
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
        display: (data, signal) => view.display({ ...data, view: visible(data.view) }, signal),
        onUpdate: (data, detail) => view.update(visible(data), detail) });
    };
    token.done = Promise.race([execute(), aborted]).then(result => {
      if (disposed || active !== token || controller.signal.aborted) throw new Error('input context expired');
      current = cloneJson(visible(result));
      view.reset(current, 'complete');
      return deepFreeze(cloneJson(current));
    }).catch(error => {
      current = cloneJson(baseline);
      viewState = cloneJson(baselineView);
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
    exportSession() {
      if (active || !ready || disposed) throw new Error('Session 尚未稳定或未成功加载，不能保存');
      return deepFreeze(validateRuntimeSession({ version: 1, cardId: definition.card.id,
        cardVersion: definition.card.version, sequence, current, viewState, retryBase: retryBase || null }, definition));
    },
    async beginLoad() {
      ready = false;
      await cancel();
      current = empty(); viewState = {}; retryBase = undefined;
      view.reset(current, 'loading');
    },
    restoreHistory(history) {
      if (active || disposed) throw new Error('Session is not idle');
      ready = false;
      if (history.runtimeSession !== undefined) {
        const saved = validateRuntimeSession(history.runtimeSession, definition);
        current = saved.current; viewState = saved.viewState; retryBase = saved.retryBase || undefined;
        sequence = Math.max(sequence, saved.sequence);
      } else {
        if (history.messages?.length || Object.keys(history.gameState || {}).length
          || history.retryBaseMessages?.length || Object.keys(history.retryBaseState || {}).length) {
          throw new Error('旧版游戏卡 Session 不能按新协议恢复');
        }
        current = empty(); viewState = {}; retryBase = undefined;
      }
      ready = true;
      view.reset(current, 'restore');
      return deepFreeze(cloneJson(current));
    },
    get viewState() { return deepFreeze(cloneJson(viewState)); },
    setViewState(update) { viewState = { ...viewState, ...cloneJson(update) }; },
    get ready() { return ready && !disposed; },
    view: view.get,
    subscribe: view.subscribe,
    advance: view.next,
    get running() { return Boolean(active); },
    cancel,
    async dispose() { disposed = true; await cancel(); }
  });
}

export { createMainSession };
