import { runExecAction } from '../../src/renderer/gameCard/execRunner.js';
import { controlledScriptExecutor, runInBrowser } from '../../src/renderer/platform/controlledScriptExecutor.js';
import { scriptWorkerSource } from '../../src/renderer/platform/scriptWorkerSource.js';

const source = `async function run(ctx) {
  const body = await ctx.files.readText('worldbook', 'config.json');
  return { state: { body } };
}`;
const action = { type: 'exec', sourceFile: 'scripts/prompt.js' };
const card = { files: { worldbook: { directory: 'worldbook', include: ['config.json'] } } };

function browserExecutor() {
  const worker = { terminate: jest.fn() };
  const release = jest.fn();
  const scope = { postMessage: data => queueMicrotask(() => worker.onmessage({ data })) };
  Function('self', scriptWorkerSource)(scope);
  worker.postMessage = jest.fn(data => queueMicrotask(() => scope.onmessage({ data })));
  return {
    worker, release,
    run: (script, context, options) => runInBrowser(script, context, {
      ...options, workerFactory: () => ({ worker, release })
    })
  };
}

function execute(scriptExecutor, readText, options = {}) {
  return runExecAction([], {}, action, {
    card, fileContents: { 'scripts/prompt.js': source }, scriptExecutor, readText, ...options
  });
}

describe('exec default timeout', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  test('allows scoped file reads longer than 50 ms through the browser Worker bridge', async () => {
    const executor = browserExecutor();
    const readText = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('book'), 100)));
    const pending = execute(executor, readText);
    const result = expect(pending).resolves.toMatchObject({
      state: { body: 'book' }, trace: { timeoutMs: 2000 }
    });

    await jest.advanceTimersByTimeAsync(99);
    expect(executor.worker.terminate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await result;
    expect(readText).toHaveBeenCalledWith('worldbook/config.json');
    expect(executor.worker.terminate).toHaveBeenCalledTimes(1);
    expect(executor.release).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each([
    ['default', {}, 2000],
    ['explicit override', { timeoutMs: 75 }, 75]
  ])('still terminates the Worker at the %s deadline and ignores late file responses', async (_label, options, deadline) => {
    const executor = browserExecutor();
    let finishRead;
    const readText = () => new Promise(resolve => { finishRead = resolve; });
    const pending = execute(executor, readText, options);
    const failure = expect(pending).rejects.toThrow('Script execution timed out');

    await jest.advanceTimersByTimeAsync(deadline - 1);
    expect(executor.worker.terminate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await failure;
    expect(executor.worker.terminate).toHaveBeenCalledTimes(1);
    expect(executor.release).toHaveBeenCalledTimes(1);

    finishRead('late body');
    await jest.advanceTimersByTimeAsync(0);
    expect(executor.worker.postMessage).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('the standalone Node executor also allows asynchronous reads beyond 50 ms by default', async () => {
    const context = {
      files: { readText: () => new Promise(resolve => setTimeout(() => resolve('book'), 100)) }
    };
    const pending = controlledScriptExecutor.run(source, context, { isSourceFile: true });
    const result = expect(pending).resolves.toEqual({ state: { body: 'book' } });

    await jest.advanceTimersByTimeAsync(100);
    await result;
    expect(jest.getTimerCount()).toBe(0);
  });

  test('the standalone Node executor still rejects an unresolved script after 2 seconds', async () => {
    const pending = controlledScriptExecutor.run('return new Promise(() => {});', {});
    const failure = expect(pending).rejects.toThrow('Script execution timed out');

    await jest.advanceTimersByTimeAsync(1999);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    await failure;
    expect(jest.getTimerCount()).toBe(0);
  });
});
