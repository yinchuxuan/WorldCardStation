const { preparePreSendMessages } = require('../game-card/legacyPipelineHarness.js');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');

const platform = createTestGameCardPlatform(() => global.platformMock);

function cardWithExec(action) {
  return {
    version: '1',
    id: 'send-card',
    name: 'Send Card',
    rules: [{ id: 'exec-rule', when: { phase: 'pre_send' }, then: [action] }]
  };
}

describe('game card send pipeline exec include scripts', () => {
  beforeEach(() => {
    global.platformMock.readGameCardFile.mockClear();
  });

  test('preloads script-level exec includes through platformMock', async () => {
    global.platformMock.readGameCardFile.mockImplementation(async (_cardId, filePath) => ({
      success: true,
      content: filePath === 'scripts/helper.js'
        ? 'function mark(ctx) { ctx.state.loadedHelper = true; }'
        : 'include("./helper.js");\nfunction run(ctx) { mark(ctx); return { state: ctx.state }; }'
    }));
    const card = cardWithExec({
      type: 'exec',
      sourceFile: 'scripts/timeline.js'
    });
    const result = await preparePreSendMessages({ messages: [], card, platform });

    expect(global.platformMock.readGameCardFile).toHaveBeenCalledWith('send-card', 'scripts/helper.js');
    expect(global.platformMock.readGameCardFile).toHaveBeenCalledWith('send-card', 'scripts/timeline.js');
    expect(result.state.loadedHelper).toBe(true);
  });
});
