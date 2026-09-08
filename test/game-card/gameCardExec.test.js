const { applyGameCard } = require('../../src/renderer/gameCard/engine');
const { applyAction } = require('../../src/shared/game-card/engine/actions');
const { runExecAction } = require('../../src/renderer/gameCard/execRunner');

function cardWithExec(source) {
  return cardWithActions([{ type: 'exec', source }]);
}

function cardWithActions(then) {
  return {
    version: '1', id: 'exec-card', name: 'Exec Card',
    rules: [{ id: 'exec-rule', when: { phase: 'after_response' }, then }]
  };
}

describe('game card exec runtime', () => {
  test('exec can transform messages and nested state through safe context', () => {
    const messages = [{ role: 'user', content: 'attack' }];
    const state = { player: { hp: 10 } };
    const card = cardWithExec(`
      state.player.hp = utils.clamp(state.player.hp - 3, 0, 100);
      messages.push({ role: 'system', content: config.name + ':' + event.phase });
      return { messages, state, effects: [{ type: 'flash' }] };
    `);

    const result = applyGameCard({ card, phase: 'after_response', messages, state });

    expect(result.messages).toEqual([
      { role: 'user', content: 'attack' },
      { role: 'system', content: 'Exec Card:after_response' }
    ]);
    expect(result.state).toEqual({ player: { hp: 7 } });
    expect(state.player.hp).toBe(10);
    expect(result.trace.rules[0].actions[0]).toMatchObject({
      type: 'exec',
      applied: true,
      matched: 1,
      effects: [{ type: 'flash' }],
      summary: { state: { changedKeys: ['player'] } }
    });
  });

  test('exec may return only state and keep messages unchanged', () => {
    const result = applyAction([{ role: 'user', content: 'hello' }], {
      type: 'exec',
      source: 'state.turn = 2; return { state };'
    }, { state: { turn: 1 }, runExecAction });

    expect(result.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(result.state).toEqual({ turn: 2 });
    expect(result.trace.summary.messages).toMatchObject({ before: 1, after: 1 });
  });

  test('exec can load source from preloaded game card file content', () => {
    const result = applyGameCard({
      card: cardWithActions([{ type: 'exec', sourceFile: 'scripts/timeline.js' }]),
      phase: 'after_response', messages: [], state: {},
      fileContents: {
        'scripts/timeline.js': 'function run(ctx) { ctx.state.plot = "FreePlot1"; return { state: ctx.state }; }'
      }
    });

    expect(result.state).toEqual({ plot: 'FreePlot1' });
    expect(result.trace.errors).toEqual([]);
    expect(result.trace.rules[0].actions[0].sourceFile).toBe('scripts/timeline.js');
  });

  test('exec sourceFile reads a relative card path through the injected reader', () => {
    const readFile = jest.fn(() => 'function run(ctx) { ctx.state.loaded = true; return { state: ctx.state }; }');
    const result = applyGameCard({
      card: cardWithActions([{ type: 'exec', sourceFile: 'scripts/timeline.js' }]),
      phase: 'after_response', messages: [], state: {},
      dependencies: { readFile }
    });

    expect(result.state).toEqual({ loaded: true });
    expect(result.trace.errors).toEqual([]);
    expect(readFile).toHaveBeenCalledWith('scripts/timeline.js');
  });

  test('exec sourceFile requires a run function', () => {
    const result = applyGameCard({
      card: cardWithActions([{ type: 'exec', sourceFile: 'scripts/timeline.js' }]),
      phase: 'after_response',
      messages: [],
      fileContents: { 'scripts/timeline.js': 'const ok = true;' }
    });

    expect(result.trace.errors[0]).toContain('exec sourceFile must define function run(ctx)');
  });

  test('exec exposes deterministic safe utils', () => {
    const result = applyGameCard({
      card: cardWithExec(`
        state.roll = utils.roll('2d1');
        state.random = utils.randomInt(4, 4);
        state.uuidOk = /^[0-9a-f-]{36}$/.test(utils.uuid());
        return { state };
      `),
      phase: 'after_response',
      messages: [],
      state: {}
    });

    expect(result.state).toEqual({ roll: 2, random: 4, uuidOk: true });
  });

  test('exec state flows through later actions in the same rule', () => {
    const result = applyGameCard({
      card: cardWithActions([
        { type: 'exec', source: 'state.turn = 1; return { state };' },
        { type: 'exec', source: 'state.turn += 1; return { state };' }
      ]),
      phase: 'after_response',
      messages: [],
      state: { turn: 0 }
    });

    expect(result.state).toEqual({ turn: 2 });
    expect(result.trace.rules[0].actions).toHaveLength(2);
    expect(result.trace.rules[0].summary.state.changedKeys).toEqual(['turn']);
  });

  test('exec keeps card config read-only', () => {
    const result = applyGameCard({
      card: cardWithExec('config.name = "Changed"; return { state: { name: config.name } };'),
      phase: 'after_response',
      messages: [],
      state: { untouched: true }
    });

    expect(result.state).toEqual({ untouched: true });
    expect(result.trace.errors[0]).toContain('read only property');
  });

  test('exec return value is validated before applying changes', () => {
    const result = applyGameCard({
      card: cardWithExec('return { messages: [{ role: "bad", content: "x" }] };'),
      phase: 'after_response',
      messages: [{ role: 'user', content: 'safe' }],
      state: { ok: true }
    });

    expect(result.messages).toEqual([{ role: 'user', content: 'safe' }]);
    expect(result.state).toEqual({ ok: true });
    expect(result.trace.errors[0]).toContain('exec messages must be valid message objects');
  });

  test('exec rejects unsupported return fields', () => {
    const result = applyGameCard({
      card: cardWithExec('state.ok = false; return { state, debug: true };'),
      phase: 'after_response',
      messages: [],
      state: { ok: true }
    });

    expect(result.state).toEqual({ ok: true });
    expect(result.trace.errors[0]).toContain('exec returned unsupported field: debug');
  });

  test('exec catches thrown script errors without applying partial changes', () => {
    const result = applyGameCard({
      card: cardWithExec('state.ok = false; throw new Error("boom");'),
      phase: 'after_response',
      messages: [],
      state: { ok: true }
    });

    expect(result.state).toEqual({ ok: true });
    expect(result.trace.errors[0]).toContain('boom');
  });

  test('exec cannot access blocked Node or DOM globals', () => {
    const result = applyGameCard({
      card: cardWithExec('return { state: { processType: typeof process, windowType: typeof window } };'),
      phase: 'after_response',
      messages: []
    });

    expect(result.state).toEqual({ processType: 'undefined', windowType: 'undefined' });
  });

  test('exec is stopped by runtime timeout', () => {
    const result = applyGameCard({
      card: cardWithExec('while (true) {}'),
      phase: 'after_response',
      messages: [{ role: 'user', content: 'safe' }]
    });

    expect(result.messages).toEqual([{ role: 'user', content: 'safe' }]);
    expect(result.trace.errors[0]).toContain('Script execution timed out');
  });
});
