import { createAgentRuntime } from './agentRuntime.js';

// Lives inside the disposable script realm. Only a completed round exports data.
async function executeMainRound({ onInput, input, ...options }) {
  const runtime = createAgentRuntime(options);
  let valid = true, rejectFailure;
  const pending = new Set();
  const failed = new Promise((_, reject) => { rejectFailure = reject; });
  const check = () => { if (!valid) throw new Error('input context expired'); };
  const ctx = Object.freeze({
    state: Object.freeze(Object.fromEntries(Object.entries(runtime.state).map(([key, fn]) =>
      [key, (...args) => { check(); return fn(...args); }]))),
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
    await Promise.race([Promise.resolve().then(() => onInput(ctx, input)), failed]);
    if (pending.size) throw new Error('onInput returned with an unfinished Agent call; await call.done()');
    return runtime.snapshot();
  } finally {
    valid = false;
    runtime.stop();
  }
}

export { executeMainRound };
