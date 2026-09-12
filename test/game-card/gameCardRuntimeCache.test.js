const { invalidateGameCardRuntimeCache } = require('../../src/renderer/gameCard/gameCardRuntimeCache');
const { applyUiScriptRunEvent } = require('../../src/renderer/gameCard/uiScripts');
const { applyUiStateActionEvent } = require('../../src/renderer/gameCard/uiStateActions');

function runtimeFiles(increment = 1, body = 'first body') {
  return {
    'state/schema.json': JSON.stringify({
      schema: { score: { type: 'number', min: 0, max: 10, onInvalid: 'clamp' } }
    }),
    'events/event.md': body,
    'ui/action.js': [
      'include("./helper.js");',
      'function run(ctx) {',
      '  ctx.state.score += increment();',
      '  ctx.state.body = ctx.files.read("event");',
      '  return { state: ctx.state };',
      '}'
    ].join('\n'),
    'ui/helper.js': `function increment() { return ${increment}; }`
  };
}

function createRuntime(files) {
  const readText = jest.fn(async (_cardId, filePath) => files[filePath]);
  return { platform: { resources: { readText } }, readText };
}

function createCard() {
  return {
    version: '1',
    id: 'cache-card',
    name: 'Cache Card',
    files: { event: 'events/event.md' },
    stateSchema: 'state/schema.json',
    rules: []
  };
}

function readCounts(readText) {
  return readText.mock.calls.reduce((counts, [, path]) => ({
    ...counts,
    [path]: (counts[path] || 0) + 1
  }), {});
}

describe('game card runtime resource cache', () => {
  beforeEach(() => invalidateGameCardRuntimeCache());

  test('reads static UI resources once across repeated script and state actions', async () => {
    const files = runtimeFiles();
    const { platform, readText } = createRuntime(files);
    const card = createCard();
    const event = { type: 'game.script.run', sourceFile: 'ui/action.js' };

    const first = await applyUiScriptRunEvent({ event, state: { score: 0 }, card, platform });
    const second = await applyUiScriptRunEvent({ event, state: first.state, card, platform });
    const clamped = await applyUiStateActionEvent({
      event: { type: 'game.state.apply', action: { type: 'state.set', path: 'score', value: 20 } },
      state: second.state,
      card,
      platform
    });

    expect(first.trace.changedKeys).toEqual(['score', 'body']);
    expect(second.state).toMatchObject({ score: 2, body: 'first body' });
    expect(clamped.state.score).toBe(10);
    expect(clamped.trace.changedKeys).toEqual(['score']);
    expect(readCounts(readText)).toEqual({
      'state/schema.json': 1,
      'events/event.md': 1,
      'ui/action.js': 1,
      'ui/helper.js': 1
    });
  });

  test('rereads changed resources after a same-id card is reimported', async () => {
    const files = runtimeFiles(1, 'old body');
    const { platform, readText } = createRuntime(files);
    const card = createCard();
    const event = { type: 'game.script.run', sourceFile: 'ui/action.js' };

    const before = await applyUiScriptRunEvent({ event, state: { score: 0 }, card, platform });
    Object.assign(files, runtimeFiles(5, 'new body'));
    invalidateGameCardRuntimeCache();
    const after = await applyUiScriptRunEvent({ event, state: { score: 0 }, card, platform });

    expect(before.state).toMatchObject({ score: 1, body: 'old body' });
    expect(after.state).toMatchObject({ score: 5, body: 'new body' });
    expect(readCounts(readText)).toEqual({
      'state/schema.json': 2, 'events/event.md': 2, 'ui/action.js': 2, 'ui/helper.js': 2
    });
  });

  test('caches source reads without hiding repeated script failures', async () => {
    const files = { 'ui/fail.js': 'function run() { throw new Error("cached boom"); }' };
    const { platform, readText } = createRuntime(files);
    const options = {
      event: { type: 'game.script.run', sourceFile: 'ui/fail.js' },
      state: { score: 3 },
      card: { version: '1', id: 'error-card', name: 'Error Card', rules: [] },
      platform
    };

    const first = await applyUiScriptRunEvent(options);
    const second = await applyUiScriptRunEvent(options);

    expect(first).toMatchObject({
      applied: false,
      state: { score: 3 },
      trace: { reason: 'script_failed', error: 'cached boom' }
    });
    expect(second.trace).toEqual(first.trace);
    expect(readText).toHaveBeenCalledTimes(1);
  });
});
