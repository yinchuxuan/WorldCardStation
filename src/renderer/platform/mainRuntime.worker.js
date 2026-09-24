import { prepareMainExecution } from './mainWorkerExecution.js';

const realm = globalThis;
const post = realm.postMessage.bind(realm);
const listen = realm.addEventListener.bind(realm);
let nextId = 0, started = false;
const pending = new Map();
function request(type, args, callbacks) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, callbacks });
    post({ type, id, args });
  });
}
listen('message', async ({ data }) => {
  if (data.type === 'ping') { post({ type: 'pong', id: data.id, waiting: pending.size > 0 }); return; }
  if (data.type === 'reply' || data.type === 'token') {
    const item = pending.get(data.id);
    if (!item) return;
    if (data.type === 'token') item.callbacks[data.thinking ? 'onThinkingToken' : 'onToken'](data.text);
    else {
      pending.delete(data.id);
      if (data.error) item.reject(new Error(data.error));
      else item.resolve(data.value);
    }
    return;
  }
  if (data.type !== 'start' || started) return;
  started = true;
  try {
    const execute = prepareMainExecution(realm, data.program, {
      generate: ({ signal: _signal, ...args }, callbacks) => request('model', args, callbacks),
      display: args => request('present', args),
      onUpdate: (view, detail) => post({ type: 'view', view, detail }),
      observer: data.trace ? (type, detail, messages, state) => post({ type: 'trace', event: { type, detail, messages, state } }) : undefined,
      readText: path => request('read', { path })
    });
    const result = await execute({ input: data.input, startup: data.startup, snapshot: data.snapshot, idPrefix: data.idPrefix });
    post({ type: 'complete', result });
  } catch (error) { post({ type: 'failed', error: `${data.program.graph.entry}: ${error.message}` }); }
});
post({ type: 'ready' });
