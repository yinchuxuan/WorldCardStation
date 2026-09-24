const { preparePreSendMessages } = require('../game-card/legacyPipelineHarness.js');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');

const platform = createTestGameCardPlatform(() => global.platformMock);

function dynamicFileCard() {
  return {
    version: '1',
    id: 'send-card',
    name: 'Send Card',
    files: { plot1: 'chapters/chapter-1/plot.md' },
    rules: [{
      when: { phase: 'pre_send' },
      then: [
        { type: 'state.set', path: 'temp.plotSection', value: 'Intro' },
        { type: 'state.set', path: 'temp.plotFile', value: 'plot1' },
        {
          type: 'insert',
          predicate: { index: 0 },
          anchor: 'before',
          role: 'system',
          content: '{{file:$temp.plotFile#$temp.plotSection}}'
        }
      ]
    }]
  };
}

describe('game card declared content file preload', () => {
  beforeEach(() => {
    global.platformMock.readGameCardFile.mockClear();
  });

  test('preloads declared content files before applying dynamic file rules', async () => {
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: '## Intro\nloaded dynamic route'
    });

    const result = await preparePreSendMessages({
      messages: [{ role: 'user', content: 'start' }],
      card: dynamicFileCard(),
      platform
    });

    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('send-card', 'chapters/chapter-1/plot.md');
    expect(result.messages[0].content).toBe('loaded dynamic route');
  });
});
