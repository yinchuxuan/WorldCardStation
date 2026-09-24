import { preparePreSendMessages } from '../game-card/legacyPipelineHarness.js';
import { checkCard } from '../../src/renderer/gameCard/dryRun/checkCard.js';
import { collectExecSourcePaths, collectFileContentPaths } from '../../src/renderer/gameCard/resourcePreload.js';

function cardWith(actions) {
  return { id: 'boundaries', version: '1', name: 'Boundaries',
    files: { book: { directory: 'book', include: ['allowed.md'] } },
    rules: [{ when: { phase: 'pre_send' }, then: actions }] };
}

test('args, state values, predicates and transform arguments remain literal data', async () => {
  const literal = '{{file:book/secret.md}}';
  const value = { type: 'exec', sourceFile: 'not-a-script.js', text: literal, matrix: [[1, 2], [3, 4]] };
  const card = cardWith([
    { type: 'exec', source: 'state.args = args; return { state };', args: value },
    { type: 'state.set', path: 'literal', value },
    { type: 'replace', predicate: { content: { contains: literal } }, content: 'unmatched' },
    { type: 'insert', role: 'system', content: `{{original_content}}.format{value:'${literal}'}` }
  ]);
  const readText = jest.fn(async () => { throw new Error('unexpected read'); });
  expect((await checkCard(card, readText)).diagnostics).toEqual([]);
  expect(collectFileContentPaths(card)).toEqual([]);
  expect(collectExecSourcePaths(card)).toEqual([]);
  const result = await preparePreSendMessages({ card, messages: [{ role: 'user', content: 'hello' }],
    platform: { resources: { readText } } });
  expect(result.error).toBeUndefined();
  expect(result.trace.errors).toEqual([]);
  expect(result.state).toEqual({ args: value, literal: value });
  expect(result.messages[1].content).toBe(literal);
  expect(readText).not.toHaveBeenCalled();
});

test('collects scripts and all Content branches within nested conditional groups', () => {
  const card = cardWith([{ when: { phase: 'pre_send' }, then: [
    { type: 'exec', sourceFile: 'actual.js', args: { sourceFile: 'ignored.js' } },
    { type: 'insert', role: 'system', content: { select: [{ content: '{{file:book/allowed.md}}' }],
      prefix: '{{file:book/allowed.md}}', suffix: '{{file:book/allowed.md}}', default: '{{file:book/allowed.md}}' } }
  ] }]);
  expect(collectExecSourcePaths(card)).toEqual(['actual.js']);
  expect(collectFileContentPaths(card)).toEqual(['actual.js', 'book/allowed.md']);
  card.rules[0].then[0].then[1].content.default = '{{file:book/secret.md}}';
  expect(() => collectFileContentPaths(card)).toThrow('outside scope');
});
