import { createAgentRuntime } from '../../shared/game-card/runtime/agentRuntime.js';
import { cloneJson, deepFreeze } from '../../shared/game-card/utils/jsonValue.js';
import { loadMainProgram } from './mainProgram.js';
import { runMainWorker } from '../platform/mainWorkerHost.js';
import { createMainSessionView } from './mainSessionView.js';
import { validateRuntimeSession } from '../../shared/game-card/runtime/sessionSnapshot.js';
import { beginMainTrace } from '../trace/mainTrace.js';
import { createMainInputQueue } from './mainInputQueue.js';

// One instance per Session; replacing/unloading it must dispose the old instance first.
function createMainSession({ definition, readText, generate, workerFactory, timeoutMs, program: preparedProgram, trace }) {
  const empty = () => ({ ...createAgentRuntime({ definition, generate }).snapshot(), records: [], messages: [] });
  let current = empty(), viewState = {}, ready = true, started = false;
  const view = createMainSessionView(current);
  let program = preparedProgram, active, retryBase, disposed = false, sequence = 0;
  let starting, failed = false, startupView;
  const queue = createMainInputQueue({ cancel: cancelActive,
    notify: () => view.update(view.get(), { type: 'queue' }) });
  function run(input, baseline, retry = false, startup = false) {
    if (disposed) return Promise.reject(new Error('game Session disposed'));
    if (!ready) return Promise.reject(new Error('Session 尚未成功加载'));
    if (active) return Promise.reject(new Error('another input is still running'));
    if (typeof input !== 'string') return Promise.reject(new Error('input must be a string'));
    const controller = new AbortController();
    const token = { controller };
    active = token;
    const baselineView = retry ? (startup ? startupView : retryBase.viewState) : cloneJson(viewState);
    if (startup && !retry) startupView = cloneJson(baselineView);
    failed = false;
    viewState = cloneJson(baselineView);
    view.reset(baseline, 'start', { retry, input, startup });
    if (!startup) retryBase = { input, snapshot: cloneJson(baseline), viewState: baselineView };
    const idPrefix = `round-${++sequence}-`;
    const log = beginMainTrace(trace?.capture(), definition, baseline, input, startup);
    const user = { id: `user-${idPrefix}`, role: 'user', content: input };
    const existing = new Set(baseline.records.map(record => record.id));
    const visible = result => ({ ...result, messages: [...baseline.messages, ...(startup ? [] : [user]),
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
      return runMainWorker({ workerFactory, program: loaded, input, startup, snapshot: baseline, idPrefix,
        generate, readText, signal: controller.signal, timeoutMs,
        display: (data, signal) => view.display({ ...data, view: visible(data.view) }, signal),
        onTrace: log ? event => log.event(event) : undefined,
        onUpdate: (data, detail) => {
          const snapshot = visible(data);
          view.update(snapshot, detail); log?.update(snapshot, detail);
        } });
    };
    token.done = Promise.race([execute(), aborted]).then(result => {
      if (disposed || active !== token || controller.signal.aborted) throw new Error('input context expired');
      current = cloneJson(visible(result));
      if (startup) started = true;
      view.reset(current, 'complete');
      log?.end(current, 'completed');
      return deepFreeze(cloneJson(current));
    }).catch(error => {
      if (controller.signal.aborted) {
        current = cloneJson(baseline);
        viewState = cloneJson(baselineView);
        view.reset(current, 'rollback');
      } else {
        failed = true;
        view.reset(view.get(), 'failed');
      }
      log?.update(view.get(), { type: failed ? 'failed' : 'rollback', error: error.message });
      log?.end(view.get(), controller.signal.aborted ? 'aborted' : 'failed');
      throw error;
    }).finally(() => {
      controller.signal.removeEventListener('abort', onAbort);
      if (active === token) active = undefined;
    });
    token.done.catch(() => {});
    return token.done;
  }
  async function cancelActive() {
    const token = active;
    token?.controller.abort();
    await token?.done.catch(() => {});
  }
  function rememberStart(work) {
    starting = work;
    work.finally(() => { if (starting === work) starting = undefined; }).catch(() => {});
    return work;
  }
  function start() {
    if (disposed) return Promise.reject(new Error('game Session disposed'));
    if (started) return Promise.resolve(deepFreeze(cloneJson(current)));
    if (!ready) return Promise.reject(new Error('Session 尚未成功加载'));
    if (!starting) rememberStart(queue.enqueue(() => run('', current, false, true)));
    return starting;
  }
  return Object.freeze({
    start,
    send(input) {
      if (typeof input !== 'string') return Promise.reject(new Error('input must be a string'));
      if (disposed || !ready) return Promise.reject(new Error(disposed ? 'game Session disposed' : 'Session 尚未成功加载'));
      if (failed) return Promise.reject(new Error('本轮已停止，请重试或切换会话'));
      const startup = !started ? start() : null;
      const pending = queue.enqueue(() => run(input, current));
      const result = startup ? Promise.all([startup, pending]).then(([, value]) => value) : pending;
      result.catch(() => {});
      return result;
    },
    retry(input = retryBase?.input) {
      if (disposed || !ready) return Promise.reject(new Error('Session unavailable'));
      if (!started) return rememberStart(queue.reset(() => run('', current, Boolean(startupView), true)));
      if (!retryBase) return Promise.reject(new Error('no input to retry'));
      return queue.reset(() => run(input, retryBase.snapshot, true));
    },
    snapshot: () => deepFreeze(cloneJson(current)),
    setState(state) {
      if (failed || queue.busy || !ready || disposed) throw new Error('Session 尚未稳定，不能修改变量');
      const candidate = typeof state === 'function' ? state(deepFreeze(cloneJson(current.state))) : state;
      const saved = validateRuntimeSession({ version: 1, cardId: definition.card.id,
        cardVersion: definition.card.version, sequence, current: { ...current, state: candidate },
        viewState, started, retryBase: retryBase || null }, definition);
      current = saved.current;
      view.reset(current, 'host-state');
    },
    exportSession() {
      if (failed || queue.busy || !ready || disposed || !started) throw new Error('Session 尚未稳定或未成功启动，不能保存');
      return deepFreeze(validateRuntimeSession({ version: 1, cardId: definition.card.id,
        cardVersion: definition.card.version, sequence, started, current, viewState, retryBase: retryBase || null }, definition));
    },
    async beginLoad() {
      ready = false;
      await queue.reset();
      current = empty(); viewState = {}; retryBase = undefined; started = false; failed = false;
      view.reset(current, 'loading');
    },
    restoreHistory(history) {
      if (queue.busy || disposed) throw new Error('Session is not idle');
      ready = false;
      if (history.runtimeSession !== undefined) {
        const saved = validateRuntimeSession(history.runtimeSession, definition);
        current = saved.current; viewState = saved.viewState; retryBase = saved.retryBase || undefined;
        sequence = Math.max(sequence, saved.sequence);
        started = saved.started;
      } else {
        if (history.messages?.length || Object.keys(history.gameState || {}).length
          || history.retryBaseMessages?.length || Object.keys(history.retryBaseState || {}).length) {
          throw new Error('旧版游戏卡 Session 不能按新协议恢复');
        }
        current = empty(); viewState = {}; retryBase = undefined; started = false;
      }
      ready = true;
      failed = false;
      view.reset(current, 'restore');
      return deepFreeze(cloneJson(current));
    },
    get viewState() { return deepFreeze(cloneJson(viewState)); },
    setViewState(update) { viewState = { ...viewState, ...cloneJson(update) }; },
    get ready() { return ready && !disposed; },
    get started() { return started; },
    view: view.get,
    subscribe: view.subscribe,
    advance: view.next,
    get running() { return queue.running; },
    get failed() { return failed; },
    get pendingCount() { return queue.pendingCount; },
    get queuePaused() { return queue.paused; },
    get retryInput() { return retryBase?.input; },
    cancel: () => queue.reset(),
    async dispose() { disposed = true; await queue.reset(); }
  });
}

export { createMainSession };
