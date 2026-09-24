const { applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { resolveContent } = require('../../src/shared/game-card/content/contentResolver');
const { validateGameCard } = require('../../src/shared/game-card/schema/validateGameCard');
const { preparePreSendMessages } = require('../game-card/legacyPipelineHarness.js');
const { collectFileContentPaths } = require('../../src/renderer/gameCard/resourcePreload');
const { createTestGameCardPlatform } = require('../platform/tauriTestClient');

function directoryCard(action) {
  return {
    version: '1', id: 'directory-card', name: 'Directory Card',
    files: {
      worldbook: { directory: 'worldbook', include: ['config.json', 'entries/*.md'] }
    },
    rules: [{ when: { phase: 'pre_send' }, then: [action] }]
  };
}

describe('game card directory text resources', () => {
  test('validates directory descriptors', () => {
    expect(validateGameCard(directoryCard({ type: 'remove', predicate: { all: true } })).valid).toBe(true);
    expect(validateGameCard({
      ...directoryCard({ type: 'remove', predicate: { all: true } }),
      files: { bad: { directory: '../worldbook', include: ['entries/*.md'] } }
    }).valid).toBe(false);
    expect(validateGameCard({
      ...directoryCard({ type: 'remove', predicate: { all: true } }),
      files: { bad: { directory: 'worldbook', include: ['entries/**.md'] } }
    }).valid).toBe(false);
  });

  test('does not expand or eagerly preload a directory registration', () => {
    const card = directoryCard({ type: 'remove', predicate: { all: true } });
    expect(collectFileContentPaths(card)).toEqual([]);
  });

  test('resolves a static directory file reference in content', () => {
    const card = directoryCard({ type: 'remove', predicate: { all: true } });
    const content = resolveContent('{{file:worldbook/entries/e000001.md}}', {}, {
      card,
      fileContents: { 'worldbook/entries/e000001.md': 'entry body' }
    });
    expect(content).toBe('entry body');
    expect(() => resolveContent('{{file:worldbook/other.txt}}', {}, { card, fileContents: {} }))
      .toThrow('outside scope worldbook');
  });

  test('prefers an exact file id over a directory scope prefix', () => {
    const card = directoryCard({ type: 'remove', predicate: { all: true } });
    card.files['worldbook/entry.md'] = 'override.md';

    expect(resolveContent('{{file:worldbook/entry.md}}', {}, {
      card, fileContents: { 'override.md': 'exact entry' }
    })).toBe('exact entry');
  });

  test('preloads literal directory references before applying rules', async () => {
    global.platformMock.readGameCardFile.mockImplementation(async (_cardId, filePath) => ({
      success: true,
      content: filePath === 'worldbook/entries/e000001.md' ? 'loaded entry' : ''
    }));
    const card = directoryCard({
      type: 'insert', role: 'system', content: '{{file:worldbook/entries/e000001.md}}'
    });
    const platform = createTestGameCardPlatform(() => global.platformMock);
    const result = await preparePreSendMessages({ card, messages: [], platform });

    expect(result.messages[0].content).toBe('loaded entry');
    expect(global.platformMock.readGameCardFile)
      .toHaveBeenCalledWith('directory-card', 'worldbook/entries/e000001.md');
  });

  test('passes immutable args and reads scoped text in async exec', async () => {
    const readText = jest.fn(async filePath => filePath === 'worldbook/config.json' ? 'book' : '');
    const card = directoryCard({
      type: 'exec',
      source: 'return files.readText(args.scope, args.path).then(body => ({ state: { body, frozen: Object.isFrozen(args) } }));',
      args: { scope: 'worldbook', path: 'config.json' }
    });
    const result = await applyGameCardAsync({
      card, phase: 'pre_send', dependencies: { readText }
    });

    expect(result.state).toEqual({ body: 'book', frozen: true });
    expect(readText).toHaveBeenCalledWith('worldbook/config.json');
  });

  test('rejects scoped paths that do not match the directory capability', async () => {
    const card = directoryCard({
      type: 'exec', source: 'return files.readText("worldbook", "../card.json").then(() => ({}));'
    });
    const result = await applyGameCardAsync({
      card, phase: 'pre_send', dependencies: { readText: jest.fn() }
    });
    expect(result.trace.errors[0]).toContain('must stay inside its file scope');
  });

  test('keeps the exec timeout for asynchronous scripts', async () => {
    const card = directoryCard({ type: 'exec', source: 'return new Promise(() => {});' });
    const result = await applyGameCardAsync({ card, phase: 'pre_send' });

    expect(result.trace.errors[0]).toContain('Script execution timed out');
  });
});
