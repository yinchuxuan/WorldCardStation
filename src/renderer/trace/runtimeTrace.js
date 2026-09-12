import { rendererServices } from '../platform/index.js';
import { createTraceCapture } from './traceCapture.js';
import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';

function createRuntimeTrace(service) {
  let current = null, enabled = false, capture = null, transitions = Promise.resolve();
  let state = { enabled: false, busy: false, path: null, error: null };
  const listeners = new Set();
  const publish = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const failure = error => publish({ error: `运行日志不完整：${error.message || String(error)}` });
  const queue = execute => {
    publish({ busy: true });
    const task = transitions.then(execute).catch(failure);
    transitions = task.finally(() => publish({ busy: false }));
    return transitions;
  };
  const open = async () => {
    if (!enabled || !current?.scope || !service) return;
    const snapshot = cloneJson(current.snapshot);
    const session = await service.start(current.scope, snapshot);
    capture = createTraceCapture(service, session, snapshot, failure);
    if (JSON.stringify(snapshot) !== JSON.stringify(current.snapshot)) {
      capture.commit(current.snapshot.messages, current.snapshot.state);
    }
    publish({ path: session.path });
  };
  const close = async reason => {
    const previous = capture;
    capture = null;
    await previous?.close(reason);
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    enable(value) {
      return queue(async () => {
        await close('mode_changed');
        enabled = value;
        publish({ enabled, error: null });
        await open();
      });
    },
    bind(scope, messages, gameState) {
      return queue(async () => {
        await close('session_changed');
        current = { scope, snapshot: cloneJson({ messages, state: gameState }) };
        publish({ path: null });
        await open();
      });
    },
    update(messages, gameState) {
      if (!current) return;
      const snapshot = { messages, state: gameState };
      if (JSON.stringify(current.snapshot) === JSON.stringify(snapshot)) return;
      current.snapshot = cloneJson(snapshot);
      capture?.commit(messages, gameState);
    },
    capture() {
      const binding = current;
      return { begin(kind, input, details) {
        return current === binding ? capture?.begin(kind, input, details) : null;
      } };
    },
    flush: () => capture?.flush() || Promise.resolve(),
    stop: () => queue(() => close('application_closed'))
  };
}

const runtimeTrace = createRuntimeTrace(rendererServices.trace);
export { createRuntimeTrace, runtimeTrace };
