const DEFAULT_MAIN_CPU_TIMEOUT_MS = 2000;

function runMainWorker({ workerFactory, program, input, startup = false, snapshot, idPrefix, generate, readText, signal, display, onUpdate, onTrace,
  timeoutMs = DEFAULT_MAIN_CPU_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('input cancelled')); return; }
    const worker = workerFactory();
    let settled = false, ping = 0, awaitingPong = false;
    const requests = new Map();
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      requests.forEach(controller => controller.abort());
      worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new Error('input cancelled'));
    const send = data => { if (!settled) worker.postMessage(data); };
    function probe() {
      if (awaitingPong) { finish(new Error('main.js computation timed out')); return; }
      awaitingPong = true;
      send({ type: 'ping', id: ++ping });
      timer = setTimeout(probe, timeoutMs);
    }
    async function handleRequest(data) {
      const controller = new AbortController();
      requests.set(data.id, controller);
      try {
        let value;
        if (data.type === 'model') {
          const agent = program.definition.agents[data.args.agentId]?.definition;
          if (!agent || agent.model !== data.args.model) throw new Error('invalid Agent model request');
          await generate({ ...data.args, signal: controller.signal }, {
            onToken: text => send({ type: 'token', id: data.id, text }),
            onThinkingToken: text => send({ type: 'token', id: data.id, text, thinking: true })
          });
        } else if (data.type === 'present') {
          if (!display) throw new Error('presentation host unavailable');
          await display(data.args, controller.signal);
        } else {
          const path = data.args.path;
          if (typeof path !== 'string' || /[\\:?#%]/.test(path) || [...path].some(char => char.charCodeAt(0) < 32)
            || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('invalid card resource path');
          value = await readText(path);
          if (typeof value !== 'string') throw new Error(`${path}: expected text`);
        }
        send({ type: 'reply', id: data.id, value });
      } catch (error) { send({ type: 'reply', id: data.id, error: error.message }); }
      finally { requests.delete(data.id); }
    }
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data.type === 'ready') { clearTimeout(timer); timer = setTimeout(probe, timeoutMs); }
      else if (data.type === 'pong' && data.id === ping) {
        awaitingPong = false;
        if (!data.waiting) finish(new Error('main.js has an unresolved task without platform work'));
      } else if (['model', 'read', 'present'].includes(data.type)) void handleRequest(data);
      else if (data.type === 'view') {
        try { onUpdate?.(data.view, data.detail); } catch (error) { finish(error); }
      }
      else if (data.type === 'trace') onTrace?.(data.event);
      else if (data.type === 'complete') finish(null, data.result);
      else if (data.type === 'failed') finish(new Error(data.error));
    };
    worker.onerror = event => finish(new Error(event.message || 'main.js Worker failed'));
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(new Error('main.js Worker startup timed out')), Math.max(timeoutMs, 10000));
    try { send({ type: 'start', program, input, startup, snapshot, idPrefix, trace: Boolean(onTrace) }); }
    catch (error) { finish(error); }
  });
}

export { runMainWorker, DEFAULT_MAIN_CPU_TIMEOUT_MS };
