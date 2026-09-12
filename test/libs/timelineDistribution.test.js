const fs = require('node:fs');
const path = require('node:path');
const { root, scripts, at, config, createCard } = require('./timelineTestRuntime');
const { runInBrowser } = require('../../src/renderer/platform/controlledScriptExecutor');
const { scriptWorkerSource } = require('../../src/renderer/platform/scriptWorkerSource');
const { resolveExecSource } = require('../../src/renderer/gameCard/execSource');
const { createExecFiles } = require('../../src/renderer/gameCard/execFiles');

describe('timeline distribution and sandbox runtime', () => {
  test('executes includes, async config reads and result serialization through the Worker bridge', async () => {
    const card = createCard();
    const readText = jest.fn(async () => JSON.stringify(config));
    const context = {
      messages: [{ role: 'user', content: '继续' }],
      state: { timeline: { currentTime: at('18:30'), currentSlotEnd: at('16:00') } },
      args: { timeline: 'timeline' }, config: {}, event: {},
      files: createExecFiles({ card, readText })
    };
    const source = resolveExecSource({ sourceFile: 'lib/timeline/index.js' }, { fileContents: scripts });
    const worker = { terminate: jest.fn() };
    const scope = { postMessage: data => queueMicrotask(() => worker.onmessage({ data })) };
    Function('self', scriptWorkerSource)(scope);
    worker.postMessage = data => queueMicrotask(() => scope.onmessage({ data }));
    const result = await runInBrowser(source, context, {
      timeoutMs: 1000, isSourceFile: true, workerFactory: () => worker
    });
    expect(result.state.timeline).toEqual({
      currentTime: at('16:00'), currentSlot: 'fixed', currentSlotEnd: at('18:00'), data: { section: 'FixedPlot1' }
    });
    expect(result.effects.timeline).toMatchObject({ selected: 'fixed', clamped: true });
    expect(result.messages).toBeUndefined();
    expect(readText.mock.calls).toEqual([['timeline/config.json']]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  test('ships only generic code and documentation', () => {
    expect(fs.readdirSync(root).sort()).toEqual(['README.md', 'lib']);
    for (const source of Object.values(scripts)) {
      expect(source).not.toMatch(/setsuna|touma|chapter2|randomInt/);
      expect(source.trimEnd().split('\n').length).toBeLessThanOrEqual(200);
    }
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain('lib/timeline/core.js');
  });
});
