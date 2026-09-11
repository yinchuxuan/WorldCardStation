import { checkCard } from '../../src/renderer/gameCard/dryRun/checkCard.js';
import { resolveContent } from '../../src/shared/game-card/content/contentResolver.js';

const base = { id: 'dry-run', version: '1', name: 'Check', rules: [] };
const rule = then => ({ when: { phase: 'pre_send' }, then });
const insert = content => ({ type: 'insert', role: 'system', content });
const check = (card, files = {}) => checkCard({ ...base, ...card }, async file => {
  if (!(file in files)) throw new Error(`missing file: ${file}`);
  return files[file];
});

test('checks valid templates with the runtime parser, without evaluating state or transforms', async () => {
  const template = "{{state:name}}.format{'【{{value}}】'}.regex_replace{pattern:'x',with:'y'}";
  const result = await check({ rules: [rule([insert(template)])] });
  expect(result.diagnostics).toEqual([]);
  expect(resolveContent(template, {}, { state: { name: 'x' } })).toBe('【y】');
});

test.each([
  ['{{state:name', 'content_syntax'],
  ['{{unknown:value}}', 'content_syntax'],
  ['{{original_content}}.bad{}', 'content_syntax'],
  ['{{original_content}}.join{', 'content_syntax'],
  ["{{original_content}}.regex_replace{pattern:'[',with:''}", 'regex_syntax'],
  ["{{original_content}}.regex_replace{pattern:'.',flags:'gg'}", 'regex_syntax']
])('reports content syntax and regex errors: %s', async (template, code) => {
  const result = await check({ rules: [rule([insert(template)])] });
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code, pointer: '/rules/0/then/0/content' }));
});

test('visits non-matching nested groups, conditions, find, content branches and affixes', async () => {
  const result = await check({ rules: [rule([{
    when: { state: { never: false } },
    then: [{ ...insert({ select: [{ when: { any: { content: { regex: '[' } } }, content: 'okay' }], suffix: '{{bad}}' }),
      find: [{ name: 'x', from: { not: { content: { regex: '(' } } }, match: { regex: '[', group: 1 } }] }]
  }])] });
  expect(result.diagnostics).toHaveLength(4);
});

test('does not interpret arbitrary state, args, metadata or display replacement as DSL', async () => {
  const data = { content: '{{unfinished', regex: '[', type: 'exec', source: 'return (' };
  const result = await check({
    state: data,
    rules: [rule([{ type: 'state.set', path: 'data', value: data },
      { type: 'exec', source: 'return { state };', args: data },
      { ...insert('okay'), _meta: data }])],
    display: { assistant: [{ stage: 'before_markdown', type: 'regex_replace', pattern: '.', replace: '{{bad}}' }] }
  });
  expect(result.diagnostics).toEqual([]);
});

test('checks literal display patterns and warns without guessing dynamic state patterns', async () => {
  const display = pattern => ({ stage: 'before_markdown', type: 'regex_replace', pattern });
  const result = await check({ display: { assistant: [display(['[']), display(['[', { state: 'tail' }])] } });
  expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'regex_syntax', pointer: '/display/assistant/0/pattern' })]);
  expect(result.warnings).toEqual([expect.objectContaining({ code: 'dynamic_regex' })]);
});

test('uses exact file ID precedence and directory authorization, with static sections', async () => {
  const files = { book: { directory: 'worldbook', include: ['entries/*.md'] }, 'book/entries/a.md': 'exact.md' };
  const result = await check({ files, rules: [rule([insert('{{file:book/entries/a.md#Title}}'),
    insert('{{file:book/entries/b.md}}')])] }, { 'exact.md': '# Title\nCorrect', 'worldbook/entries/b.md': '{{not a template' });
  expect(result.diagnostics).toEqual([]);
});

test.each(['{{file:unknown}}', '{{file:book/no.txt}}', '{{file:book/../outside.md}}', '{{file:book/entries/missing.md}}', '{{file:book/entries/a.md#Missing}}'])('rejects invalid static references: %s', async content => {
  const result = await check({ files: { book: { directory: 'worldbook', include: ['entries/*.md'] } },
    rules: [rule([insert(content)])] }, { 'worldbook/entries/a.md': '# Present\nBody' });
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'file_reference' }));
});

test('warns on dynamic IDs/sections and does not enumerate or eagerly read directory entries', async () => {
  const readText = jest.fn(async () => '# A\nText');
  const result = await checkCard({ ...base, files: { book: { directory: 'book', include: ['*.md'] } },
    rules: [rule([insert('{{file:$path}} {{file:book/a.md#$heading}}')])] }, readText);
  expect(result.diagnostics).toEqual([]);
  expect(result.warnings).toHaveLength(2);
  expect(readText.mock.calls).toEqual([['book/a.md']]);
});

test('includes runtime-only structural checks in addition to native schema', async () => {
  const result = await check({ visual: { background: { a: 'a.png' }, cg: { a: 'b.png' } } });
  expect(result.diagnostics[0]).toMatchObject({ code: 'runtime_schema' });
  expect(result.diagnostics[0].message).toContain('duplicates');
});

test('state paths named or/not are data names, not message predicate operators', async () => {
  const result = await check({ rules: [{ when: { phase: 'init', state: { or: { regex: '[' }, not: true } }, then: [insert('okay')] }] });
  expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'regex_syntax', pointer: '/rules/0/when/state/or/regex' })]);
});

test('response-validation regex errors retain their exact JSON Pointer', async () => {
  const result = await check({ responseValidation: { rules: [{ id: 'check', type: 'content.regex', pattern: '[', matches: { eq: 1 }, message: 'missing' }] } });
  expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'regex_syntax', pointer: '/responseValidation/rules/0/pattern' })]);
});

test('validates scope patterns without turning exact includes into required files', async () => {
  const result = await check({ files: { book: { directory: 'book', include: ['entries//*.md', 'optional.json'] } } });
  expect(result.diagnostics).toEqual([expect.objectContaining({ pointer: '/files/book/include/0' })]);
});
