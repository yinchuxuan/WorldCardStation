const { applyUiScriptRunEvent, normalizeUiScriptRunEvent } = require('../../src/renderer/gameCard/uiScripts');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');
const { expandCardImports } = require('../platform/cardImportExpander');

describe('game card ui scripts', () => {
  test('normalizes sourceFile and named card scripts', () => {
    const card = { ui: { scripts: { pick: 'ui/pick.js' } } };

    expect(normalizeUiScriptRunEvent({ type: 'game.script.run', sourceFile: 'ui/direct.js' }))
      .toMatchObject({ ok: true, sourceFile: 'ui/direct.js' });
    expect(normalizeUiScriptRunEvent({ type: 'game.script.run', name: 'pick' }, card))
      .toMatchObject({ ok: true, sourceFile: 'ui/pick.js', name: 'pick' });
    expect(normalizeUiScriptRunEvent({ type: 'game.script.run', sourceFile: '../bad.js' }))
      .toMatchObject({ ok: false, reason: 'invalid_source_file' });
  });

  test('runs a card script with payload and script includes', async () => {
    const api = {
      readGameCardFile: jest.fn(async (_id, filePath) => ({
        success: true,
        content: filePath === 'ui/helper.js'
          ? 'function applyChoice(ctx) { ctx.state.score += ctx.utils.randomInt(2, 2) + ctx.event.payload.bonus; }'
          : 'include("./helper.js");\nfunction run(ctx) { applyChoice(ctx); ctx.state.events.queue.shift(); return { state: ctx.state }; }'
      }))
    };
    const result = await applyUiScriptRunEvent({
      event: { type: 'game.script.run', name: 'pick', payload: { bonus: 1 } },
      state: { score: 1, events: { queue: [{ id: 'a' }, { id: 'b' }] } },
      messages: [{ role: 'user', content: 'x' }],
      card: { id: 'card', ui: { scripts: { pick: 'ui/pick.js' } } },
      platform: createTestGameCardPlatform(api)
    });

    expect(api.readGameCardFile).toHaveBeenCalledWith('card', 'ui/helper.js');
    expect(result.applied).toBe(true);
    expect(result.state).toEqual({ score: 4, events: { queue: [{ id: 'b' }] } });
    expect(result.trace.changedKeys).toEqual(['score', 'events']);
  });

  test('resolves named scripts from repository-expanded ui config', async () => {
    const api = {
      readGameCardFile: jest.fn(async (_id, filePath) => ({
        success: true,
        content: filePath === 'ui.json'
          ? JSON.stringify({ scripts: { pick: 'ui/pick.js' } })
          : 'function run(ctx) { ctx.state.picked = ctx.event.payload.id; return { state: ctx.state }; }'
      }))
    };
    const result = await applyUiScriptRunEvent({
      event: { type: 'game.script.run', name: 'pick', payload: { id: 'answer' } },
      state: {},
      card: await expandCardImports({ id: 'card', ui: { $import: 'ui.json' } }, createTestGameCardPlatform(api).resources),
      platform: createTestGameCardPlatform(api)
    });

    expect(result.state).toEqual({ picked: 'answer' });
    expect(api.readGameCardFile).toHaveBeenCalledWith('card', 'ui.json');
    expect(api.readGameCardFile).toHaveBeenCalledWith('card', 'ui/pick.js');
  });

  test('rejects ui scripts that try to modify messages', async () => {
    const api = {
      readGameCardFile: jest.fn(async () => ({
        success: true,
        content: 'function run(ctx) { ctx.messages.push({ role: "system", content: "x" }); ctx.state.score = 2; return { messages: ctx.messages, state: ctx.state }; }'
      }))
    };
    const result = await applyUiScriptRunEvent({
      event: { type: 'game.script.run', sourceFile: 'ui/bad.js' },
      state: { score: 1 },
      messages: [],
      card: { id: 'card' },
      platform: createTestGameCardPlatform(api)
    });

    expect(result).toMatchObject({ applied: false, state: { score: 1 }, trace: { reason: 'messages_not_supported' } });
  });

  test('preloads declared files for isolated ui scripts', async () => {
    const api = {
      readGameCardFile: jest.fn(async (_id, filePath) => ({
        success: true,
        content: filePath.endsWith('.md')
          ? 'event body'
          : 'function run(ctx) { ctx.state.body = ctx.files.read("event"); return { state: ctx.state }; }'
      }))
    };
    const result = await applyUiScriptRunEvent({
      event: { type: 'game.script.run', sourceFile: 'ui/read.js' },
      state: {},
      card: { id: 'card', files: { event: 'events/event.md' } },
      platform: createTestGameCardPlatform(api)
    });

    expect(api.readGameCardFile).toHaveBeenCalledWith('card', 'events/event.md');
    expect(result.state.body).toBe('event body');
  });
});
