const { runInBrowser } = require('../../src/renderer/platform/controlledScriptExecutor.js');
const { scriptWorkerSource } = require('../../src/renderer/platform/scriptWorkerSource.js');

describe('browser exec scoped file bridge', () => {
  test('relays scoped text requests without exposing the platform reader', async () => {
    const readText = jest.fn(async () => 'entry body');
    const context = { messages: [], state: {}, config: {}, event: {}, args: {}, files: { readText } };
    const worker = { terminate: jest.fn() };
    worker.postMessage = jest.fn((message) => {
      if (message.type === 'file.response') {
        setTimeout(() => worker.onmessage({ data: { result: { state: { body: message.content } } } }), 0);
        return;
      }
      setTimeout(() => worker.onmessage({
        data: {
          type: 'file.read', requestId: 1,
          scopeId: 'worldbook', relativePath: 'entries/e000001.md'
        }
      }), 0);
    });

    const result = await runInBrowser('source', context, {
      timeoutMs: 50, workerFactory: () => worker
    });

    expect(result.state.body).toBe('entry body');
    expect(readText).toHaveBeenCalledWith('worldbook', 'entries/e000001.md');
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'file.response', requestId: 1, content: 'entry body'
    }));
  });

  test('worker readText resolves through a file response', async () => {
    const scope = { postMessage: jest.fn() };
    Function('self', scriptWorkerSource)(scope);
    const execution = scope.onmessage({ data: {
      source: 'return files.readText(args.scope, args.path).then(body => ({ state: { body, frozen: Object.isFrozen(args) } }));',
      isSourceFile: false,
      context: {
        messages: [], state: {}, config: {}, event: {},
        args: { scope: 'worldbook', path: 'entries/e000001.md' }
      },
      files: {}
    } });
    await Promise.resolve();
    const request = scope.postMessage.mock.calls[0][0];

    expect(request).toEqual(expect.objectContaining({
      type: 'file.read', scopeId: 'worldbook', relativePath: 'entries/e000001.md'
    }));
    await scope.onmessage({ data: {
      type: 'file.response', requestId: request.requestId, content: 'worker entry'
    } });
    await execution;
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      result: { state: { body: 'worker entry', frozen: true } }
    });
  });
});
