const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { resolveExecSource } = require('../../src/renderer/gameCard/execSource');

const script = 'include("./helper.js");\nfunction run(ctx) { return { state: { text: prefix() + ctx.files.read("guide") } }; }';
const files = {
  'scripts/run.js': script,
  'scripts/helper.js': 'function prefix() { return "loaded: "; }',
  'content/guide.md': 'guide'
};
const card = {
  version: '1', id: 'resource-reader', name: 'Resource Reader',
  files: { guide: 'content/guide.md' },
  rules: [{ when: { phase: 'pre_send' }, then: [{ type: 'exec', sourceFile: 'scripts/run.js' }] }]
};

describe.each([
  ['sync', applyGameCard],
  ['async', applyGameCardAsync]
])('%s injected game card readers', (_name, apply) => {
  test('uses one reader for script includes and registered Content files', async () => {
    const readFile = jest.fn(relativePath => files[relativePath]);
    const result = await apply({ card, phase: 'pre_send', dependencies: { readFile } });
    expect(result.trace.errors).toEqual([]);
    expect(result.state).toEqual({ text: 'loaded: guide' });
    expect(readFile.mock.calls).toEqual([
      ['scripts/run.js'], ['scripts/helper.js'], ['content/guide.md']
    ]);
  });

  test('preloaded content takes priority over a reader', async () => {
    const readFile = jest.fn(() => { throw new Error('must use preloaded content'); });
    const result = await apply({ card, phase: 'pre_send', fileContents: files, dependencies: { readFile } });
    expect(result.trace.errors).toEqual([]);
    expect(result.state).toEqual({ text: 'loaded: guide' });
    expect(readFile).not.toHaveBeenCalled();
  });

  test('continues to allow an explicitly injected exec runner', async () => {
    const runExecAction = jest.fn(() => ({ messages: [], state: { injected: true }, trace: { type: 'exec' } }));
    const result = await apply({ card, phase: 'pre_send', dependencies: { runExecAction } });
    expect(result.trace.errors).toEqual([]);
    expect(result.state).toEqual({ injected: true });
    expect(runExecAction).toHaveBeenCalledTimes(1);
  });
});

describe('exec resource read boundary', () => {
  test.each(['/outside.js', '../outside.js', 'scripts/../../outside.js', 'scripts\\outside.js'])(
    'rejects unsafe source path %s before reading', sourceFile => {
      const readFile = jest.fn();
      expect(() => resolveExecSource({ sourceFile }, { readFile })).toThrow(/relative|inside game card/);
      expect(readFile).not.toHaveBeenCalled();
    }
  );

  test('rejects an escaping include before reading its target', () => {
    const readFile = jest.fn(() => 'include("../../outside.js");');
    expect(() => resolveExecSource({ sourceFile: 'scripts/run.js' }, { readFile })).toThrow('inside game card');
    expect(readFile.mock.calls).toEqual([['scripts/run.js']]);
  });

  test.each([undefined, {}, Promise.resolve('script')])('rejects a non-text synchronous reader result %#', value => {
    expect(() => resolveExecSource({ sourceFile: 'scripts/run.js' }, { readFile: () => value }))
      .toThrow('exec file reader must return text: scripts/run.js');
  });

  test('requires preloaded content or an injected reader', () => {
    expect(() => resolveExecSource({ sourceFile: 'scripts/run.js' }))
      .toThrow('exec sourceFile requires preloaded content');
  });
});
