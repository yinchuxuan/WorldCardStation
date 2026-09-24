const {
  prepareAfterResponseMessages,
  prepareInitMessages,
  preparePreSendMessages
} = require('../game-card/legacyPipelineHarness.js');
const { controlledScriptExecutor } = require('../../src/renderer/platform/controlledScriptExecutor.js');
const { createMemoryGameCardPlatform } = require('../../src/renderer/platform/memoryGameCardPlatform.js');
const { createTauriGameCardPlatform } = require('../../src/renderer/platform/tauriGameCardPlatform.js');

function testCard() {
  return {
    version: '1',
    id: 'memory-card',
    name: 'Memory Card',
    stateSchema: 'state/schema.json',
    files: { guide: 'content/guide.md' },
    rules: [
      {
        when: { phase: 'init' },
        then: [{ type: 'exec', sourceFile: 'scripts/init.js' }]
      },
      {
        when: { phase: 'pre_send' },
        then: [
          { type: 'insert', role: 'system', content: '{{file:guide}}' },
          { type: 'exec', source: 'state.score += 1; return { state };' }
        ]
      },
      {
        when: { phase: 'after_response' },
        then: [{ type: 'exec', source: 'state.completed = true; return { state };' }]
      }
    ]
  };
}

const files = {
  'state/schema.json': JSON.stringify({ schema: { score: { type: 'number', default: 1 } } }),
  'content/guide.md': 'memory guide',
  'scripts/init.js': 'function run(ctx) { ctx.state.initialized = true; return { state: ctx.state }; }'
};

async function verifyPipeline(platform) {
  const initialized = await prepareInitMessages({ platform });
  expect(initialized.state).toEqual({ score: 1, initialized: true });

  const preSend = await preparePreSendMessages({
    platform,
    messages: [{ role: 'user', content: 'start' }],
    state: initialized.state
  });
  expect(preSend.messages[1]).toEqual({ role: 'system', content: 'memory guide' });
  expect(preSend.state.score).toBe(2);

  const after = await prepareAfterResponseMessages({
    platform,
    card: preSend.card,
    messages: [...preSend.messages, { role: 'assistant', content: 'done' }],
    state: preSend.state
  });
  expect(after.state).toMatchObject({ score: 2, initialized: true, completed: true });
}

describe('game card platform adapter pipeline', () => {
  test('runs init, pre-send, and after-response with an in-memory adapter', async () => {
    const run = jest.fn((source, context, options) => (
      controlledScriptExecutor.run(source, context, options)
    ));
    const platform = createMemoryGameCardPlatform({
      activeCard: testCard(),
      files,
      scriptExecutor: { run }
    });

    await verifyPipeline(platform);
    expect(run).toHaveBeenCalledTimes(3);
  });

  test('runs the same pipeline through mocked Tauri commands', async () => {
    const platform = createTauriGameCardPlatform({
      invoke: async (command, args) => {
        if (command === 'get_active_game_card') return testCard();
        if (command === 'read_game_card_file') return files[args.relativePath];
        throw new Error(`Unexpected command: ${command}`);
      }
    });

    await verifyPipeline(platform);
  });
});
