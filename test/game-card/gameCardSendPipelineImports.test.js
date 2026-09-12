const { prepareInitMessages, preparePreSendMessages } = require('../../src/renderer/gameCard/sendPipeline');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');
const { expandCardImports } = require('../platform/cardImportExpander');

const platform = createTestGameCardPlatform(() => global.platformMock);

function readGameCardFile(cardId, filePath) {
  const files = {
    'files.json': JSON.stringify({ plot_guides: 'plot_guides.md' }),
    'plot_guides.md': '# Plot\n## FreePlot1\nloaded guide',
    'rules/tail.json': JSON.stringify([{
      id: 'tail',
      when: { phase: 'pre_send' },
      then: [{
        type: 'replace',
        predicate: { role: 'user', index: 'last' },
        content: '{{original_content}}\n{{file:plot_guides#FreePlot1}}'
      }]
    }])
  };
  return Promise.resolve({ success: true, content: files[filePath] || '' });
}

describe('game card send pipeline imports', () => {
  beforeEach(() => {
    global.platformMock.readGameCardFile.mockImplementation(readGameCardFile);
  });

  test('applies pre_send replacements to imports already expanded by the repository', async () => {
    const card = {
      version: '1',
      id: 'send-card',
      name: 'Send Card',
      files: { $import: 'files.json' },
      rules: [{ $import: 'rules/tail.json' }]
    };

    const result = await preparePreSendMessages({
      messages: [{ role: 'user', content: 'go' }],
      card: await expandCardImports(card, platform.resources),
      platform
    });

    expect(result.trace.errors).toEqual([]);
    expect(result.messages[0].content).toBe('go\nloaded guide');
    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('send-card', 'files.json');
    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('send-card', 'plot_guides.md');
  });

  test('initializes existing history with repository-expanded imports', async () => {
    const result = await prepareInitMessages({
      messages: [{ role: 'user', content: 'existing' }],
      card: await expandCardImports({
        version: '1',
        id: 'send-card',
        name: 'Send Card',
        files: { $import: 'files.json' },
        rules: []
      }, platform.resources),
      platform
    });

    expect(result.card.files.plot_guides).toBe('plot_guides.md');
    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('send-card', 'files.json');
  });
});
