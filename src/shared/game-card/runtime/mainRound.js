import { createAgentRuntime } from './agentRuntime.js';
import { createMainReaders } from './mainReaders.js';

// Lives inside the disposable script realm. Only a completed round exports data.
async function executeMainRound({ onInput, onStart, startup = false, input, display = async () => { throw new Error('presentation host unavailable'); },
  onUpdate = () => {}, ...options }) {
  let readers;
  const runtime = createAgentRuntime({ ...options, onUpdate: (_, detail) => onUpdate(readers.view(), detail) });
  let valid = true, rejectFailure;
  const pending = new Set();
  const failed = new Promise((_, reject) => { rejectFailure = reject; });
  const check = () => { if (!valid) throw new Error('input context expired'); };
  readers = createMainReaders({ runtime, snapshot: options.snapshot, idPrefix: options.idPrefix || '',
    separator: options.definition.card.display?.segmentSeparator, check, fail: rejectFailure, display, update: onUpdate });
  const ctx = Object.freeze({
    state: Object.freeze(Object.fromEntries(Object.entries(runtime.state).map(([key, fn]) =>
      [key, (...args) => { check(); return fn(...args); }]))),
    createReader: readers.createReader,
    present(reader, options) {
      const work = readers.present(reader, options);
      work.catch(rejectFailure);
      return work;
    },
    agents: Object.freeze({
      messages(id) { check(); return runtime.agents.messages(id); },
      call(id) {
        check();
        const handle = runtime.agents.call(id);
        const done = handle.done();
        pending.add(done);
        done.then(() => pending.delete(done), rejectFailure);
        return handle;
      }
    })
  });
  try {
    await runtime.initialize();
    await Promise.race([Promise.resolve().then(() => startup ? onStart?.(ctx) : onInput(ctx, input)), failed]);
    if (pending.size) throw new Error(`${startup ? 'onStart' : 'onInput'} returned with an unfinished Agent call; await call.done()`);
    readers.assertFinished();
    return readers.view();
  } finally {
    valid = false;
    runtime.stop();
  }
}

export { executeMainRound };
