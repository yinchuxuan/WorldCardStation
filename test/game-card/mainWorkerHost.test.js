import { runMainWorker } from '../../src/renderer/platform/mainWorkerHost.js';
import { barrier } from './agentRuntimeHelpers.js';

function setup(overrides = {}) {
  const worker = { postMessage: jest.fn(), terminate: jest.fn() };
  const controller = new AbortController();
  const options = { workerFactory: () => worker, program: { definition: { agents: { judge: { definition: { model: 'default' } } } } },
    signal: controller.signal, timeoutMs: 100, ...overrides };
  const result = runMainWorker(options);
  result.catch(() => {});
  return { worker, controller, result, emit: data => worker.onmessage({ data }) };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
afterEach(() => jest.useRealTimers());

test('routes content/thinking and text reads without passing model credentials to Worker', async () => {
  const generate = jest.fn(async (_, cb) => { cb.onToken('text'); cb.onThinkingToken('thinking'); });
  const { result, worker, emit } = setup({ generate, readText: async () => 'content' });
  emit({ type: 'model', id: 1, args: { agentId: 'judge', model: 'default', messages: [] } });
  emit({ type: 'read', id: 2, args: { path: 'world/a.md' } });
  await flush();
  expect(generate.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'token', id: 1, text: 'thinking', thinking: true });
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reply', id: 2, value: 'content' });
  emit({ type: 'complete', result: { state: {} } });
  await expect(result).resolves.toEqual({ state: {} });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test('unknown model and unsafe paths fail closed; read failures are returned', async () => {
  const { result, worker, emit, controller } = setup({ readText: async () => 42 });
  emit({ type: 'model', id: 1, args: { agentId: 'judge', model: 'secret' } });
  emit({ type: 'read', id: 2, args: { path: '../outside' } });
  emit({ type: 'read', id: 3, args: { path: 'inside.md' } });
  await flush();
  for (const id of [1, 2, 3]) expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'reply', id, error: expect.any(String) }));
  controller.abort();
  await expect(result).rejects.toThrow('cancelled');
});

test('cancel aborts pending request and suppresses its late callbacks/reply', async () => {
  const gate = barrier();
  let request, callbacks;
  const { result, worker, emit, controller } = setup({ generate: async (req, cb) => { request = req; callbacks = cb; await gate.promise; } });
  emit({ type: 'model', id: 1, args: { agentId: 'judge', model: 'default' } });
  controller.abort();
  await expect(result).rejects.toThrow('cancelled');
  expect(request.signal.aborted).toBe(true);
  const count = worker.postMessage.mock.calls.length;
  callbacks.onToken('late'); gate.resolve(); await flush();
  emit({ type: 'complete', result: {} });
  expect(worker.postMessage).toHaveBeenCalledTimes(count);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test('watchdog distinguishes responsive model wait, hung computation and unsupported async tasks', async () => {
  jest.useFakeTimers();
  const item = setup();
  item.emit({ type: 'ready' });
  jest.advanceTimersByTime(100);
  item.emit({ type: 'pong', id: 1, waiting: true });
  jest.advanceTimersByTime(100);
  item.emit({ type: 'pong', id: 2, waiting: true });
  jest.advanceTimersByTime(200);
  await expect(item.result).rejects.toThrow('computation timed out');
  const unresolved = setup();
  unresolved.emit({ type: 'ready' });
  jest.advanceTimersByTime(100);
  unresolved.emit({ type: 'pong', id: 1, waiting: false });
  await expect(unresolved.result).rejects.toThrow('unresolved');
  const startup = setup();
  jest.advanceTimersByTime(10000);
  await expect(startup.result).rejects.toThrow('startup');
});

test('worker error, script failure, and an already-aborted signal reject', async () => {
  const crashed = setup();
  crashed.worker.onerror({ message: 'crashed' });
  await expect(crashed.result).rejects.toThrow('crashed');
  const failed = setup();
  failed.emit({ type: 'failed', error: 'main.js: broken' });
  await expect(failed.result).rejects.toThrow('broken');
  const controller = new AbortController(); controller.abort();
  await expect(setup({ signal: controller.signal }).result).rejects.toThrow('cancelled');
});
