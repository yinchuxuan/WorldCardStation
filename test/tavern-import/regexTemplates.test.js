import { runtime, source } from './runtime.js';
import { preparePreSendMessages } from '../game-card/legacyPipelineHarness.js';
import { applyAssistantDisplayRules } from '../../src/renderer/gameCard/displayRules.js';
import { resolveDisplayState } from '../../src/renderer/gameCard/regexTemplate.js';

async function transform(text, extra = {}) {
  const rule = { placement: [2], findRegex: '/(?<word>x)(z)?/g', replaceString: '$0 {{match}} $1 $2 $<word> $99 $<missing> $&', ...extra };
  const converted = runtime(source({ extensions: { regex_scripts: [rule] } }), { options: { userName: 'A.B' } });
  const result = await preparePreSendMessages({ ...converted, messages: [{ role: 'assistant', content: text }] });
  expect(result.trace.errors).toEqual([]);
  return { converted, result, text: rule.markdownOnly && !rule.promptOnly
    ? applyAssistantDisplayRules(text, resolveDisplayState(converted.card.display, result.state), 0)
    : result.messages[0].content };
}

test.each([{ promptOnly: true }, { markdownOnly: true }])('capture templates preserve Tavern replacement semantics: %p', async mode => {
  const result = await transform('x xz', mode);
  expect(result.text).toBe('x x x  x   $& xz xz x z x   $&');
});

test.each([{ promptOnly: true }, { markdownOnly: true }])('trims capture text and resolves names without interpreting captured macros: %p', async mode => {
  const result = await transform(' xx{{user}}xx ', { ...mode, findRegex: '/(.*)/', trimStrings: ['xx', ' '],
    replaceString: '{{user}}:$1:$<constructor>' });
  expect(result.text).toBe('A.B:{{user}}:');
});

test.each([1, 2])('substituteRegex=%s interpolates only macro values, with optional escaping', async substituteRegex => {
  const result = await transform('A.B A-B', { promptOnly: true, findRegex: '/{{user}}/g', replaceString: 'hit', substituteRegex });
  expect(result.text).toBe(substituteRegex === 2 ? 'hit A-B' : 'hit hit');
});

test('display templates escape regex state values and update state without interpreting arbitrary Content', async () => {
  const { converted, result } = await transform('A.B A-B', { markdownOnly: true, findRegex: '/{{user}}/g',
    replaceString: '{{char}} {{file:secret}} $1', substituteRegex: 2 });
  const display = resolveDisplayState(converted.card.display, { ...result.state,
    __tavern: { ...result.state.__tavern, character: 'Changed' } });
  expect(applyAssistantDisplayRules('A.B A-B', display, 0)).toBe('Changed {{file:secret}}  A-B');
  expect(converted.report.some(item => item.code === 'regex_macro_unsupported')).toBe(true);
});

test('substituteRegex=0 leaves literal macros in a bare expression; no g replaces only the first match', async () => {
  const result = await transform('{{user}} {{user}}', { promptOnly: true, findRegex: '{{user}}', replaceString: 'hit', substituteRegex: 0 });
  expect(result.text).toBe('hit {{user}}');
});

test('getvar uses the same safe variable mapping as character fields', async () => {
  const converted = runtime(source({ first_mes: '{{setvar::score::42}}', extensions: { regex_scripts: [
    { placement: [2], promptOnly: true, findRegex: 'x', replaceString: '{{getvar::score}}' }
  ] } }));
  const key = JSON.parse(converted.files['import/manifest.json']).variables.score;
  const result = await preparePreSendMessages({ ...converted, state: { __tavern: { variables: { [key]: '42' } } },
    messages: [{ role: 'assistant', content: 'x' }] });
  expect(result.trace.errors).toEqual([]);
  expect(result.messages[0].content).toBe('42');
});

test.each([{ markdownOnly: true }, { promptOnly: true }])('dynamic trim templates survive card import array expansion: %p', async mode => {
  const result = await transform('beforeA.Bafter', { ...mode, findRegex: '(.*)', replaceString: '$1', trimStrings: ['before{{user}}', 'after'] });
  expect(result.text).toBe('');
});

test('replacement strings are serialized as data, never executed as code', async () => {
  const payload = '");throw new Error("injected"); // {{unknown::{{setvar::x::1}}}}';
  const result = await transform('x', { promptOnly: true, replaceString: payload });
  expect(result.text).toBe(payload);
  expect(result.result.state.__tavern.variables).toEqual({});
});

test('invalid dynamically interpolated regex is skipped with a runtime warning', async () => {
  const converted = runtime(source({ extensions: { regex_scripts: [
    { placement: [2], promptOnly: true, findRegex: '/{{user}}/', replaceString: 'hit', substituteRegex: 1 }
  ] } }), { options: { userName: '[' } });
  const result = await preparePreSendMessages({ ...converted, messages: [{ role: 'assistant', content: 'x' }] });
  expect(result.messages[0].content).toBe('x');
  expect(result.trace.rules[0].actions[0].effects.regex.warnings).toHaveLength(1);
});

test.each([{ markdownOnly: true }, { promptOnly: true }])('oversized replacements are stopped without changing the input: %p', async mode => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const result = await transform('x'.repeat(100), { ...mode, findRegex: '/x/g', replaceString: 'z'.repeat(100000) });
    expect(result.text).toBe('x'.repeat(100));
    if (mode.promptOnly) expect(result.result.trace.rules[0].actions[0].effects.regex.warnings).toHaveLength(1);
    else expect(warn).toHaveBeenCalled();
  } finally { warn.mockRestore(); }
});
