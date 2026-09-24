import { runtime, source } from './runtime.js';
import { prepareInitMessages, preparePreSendMessages, prepareAfterStreamMessages, toApiMessages } from '../game-card/legacyPipelineHarness.js';
import { applyAssistantDisplayRules } from '../../src/renderer/gameCard/displayRules.js';

const regex = extra => ({ findRegex: '/x/g', replaceString: 'y', placement: [2], ...extra });
const card = rules => runtime(source({ first_mes: 'x', extensions: { regex_scripts: rules } }));
const preSend = (converted, messages, state) => preparePreSendMessages({ ...converted, messages, state });

test('display-only rules stay UI-only and preserve native ordering', async () => {
  const converted = card([regex({ markdownOnly: true }), regex({ markdownOnly: true, findRegex: 'y', replaceString: 'z' })]);
  const initialized = await prepareInitMessages(converted);
  expect(initialized.trace.errors).toEqual([]);
  expect(initialized.messages[0].content).toBe('x');
  expect(applyAssistantDisplayRules('x', converted.card.display, 0)).toBe('z');
  expect(converted.files['scripts/regex.js']).toBeUndefined();
  expect(converted.report.every(item => item.severity === 'info')).toBe(true);
});

test.each(['chara_card_v2', 'chara_card_v3'])('%s prompt regex changes the one saved/API history before worldbook scanning', async spec => {
  const converted = runtime(source({ first_mes: 'private <memory_log>summary</memory_log>',
    character_book: { entries: [
      { id: 1, keys: ['private'], content: 'must not activate' },
      { id: 2, keys: ['summary'], content: 'matched summary' }
    ] }, extensions: { regex_scripts: [regex({ findRegex: '^.*?<memory_log>(.*?)</memory_log>.*$',
      replaceString: '$1', promptOnly: true, minDepth: 1, maxDepth: null })] } }, spec));
  const initialized = await prepareInitMessages(converted);
  const result = await preSend(converted, [...initialized.messages, { role: 'user', content: 'go' }], initialized.state);
  expect(result.trace.errors).toEqual([]);
  expect(result.messages.find(message => message.role === 'assistant').content).toBe('summary');
  expect(result.messages.map(message => message.content)).toContain('matched summary');
  expect(result.messages.map(message => message.content)).not.toContain('must not activate');
  expect(toApiMessages(result.messages).find(message => message.role === 'assistant').content).toBe('summary');
  expect(JSON.stringify(result.messages)).not.toContain('private');
  expect(result.trace.rules[0].actions[0].effects.worldbook.selected).toEqual(['2']);
  expect(converted.report.some(item => item.code === 'regex_unified_messages' && item.severity === 'info')).toBe(true);
});

test('both mode transforms greetings and completed responses without double display/pre_send replacements', async () => {
  const converted = card([regex({ markdownOnly: true, promptOnly: true, findRegex: '^', replaceString: 'prefix ' })]);
  const initialized = await prepareInitMessages(converted);
  expect(initialized.trace.errors).toEqual([]);
  expect(initialized.messages[0].content).toBe('prefix x');
  expect(converted.card.display).toBeUndefined();
  const sent = await preSend(converted, initialized.messages, initialized.state);
  expect(sent.messages[0].content).toBe('prefix x');
  const finished = await prepareAfterStreamMessages({ ...converted, state: sent.state,
    messages: [...sent.messages, { role: 'assistant', content: 'answer' }] });
  expect(finished.trace.errors).toEqual([]);
  expect(finished.messages[1].content).toBe('prefix answer');
  const repeated = await preSend(converted, finished.messages, finished.state);
  expect(repeated.messages.map(message => message.content)).toEqual(['prefix x', 'prefix answer']);
});

test('source rules process new user/assistant messages at their existing lifecycle points', async () => {
  const converted = card([regex({ placement: [1, 2] })]);
  const initialized = await prepareInitMessages(converted);
  expect(initialized.messages[0].content).toBe('y');
  const sent = await preSend(converted, [...initialized.messages, { role: 'user', content: 'x' }], initialized.state);
  expect(sent.messages[1].content).toBe('y');
  const finished = await prepareAfterStreamMessages({ ...converted, state: sent.state,
    messages: [...sent.messages, { role: 'assistant', content: 'x' }] });
  expect(finished.messages[2].content).toBe('y');
});

test('depth excludes hidden examples/worldbook/debug; newly eligible rules execute once, even after restart', async () => {
  const converted = card([regex({ findRegex: '^', replaceString: 'old ', promptOnly: true, minDepth: 2, maxDepth: 2 })]);
  let result = await preSend(converted, [{ role: 'assistant', content: 'answer' },
    { role: 'assistant', content: 'example', _meta: { visibility: 'llm_only' } },
    { role: 'assistant', content: 'debug', _meta: { visibility: 'debug_only' } },
    { role: 'user', content: 'go' }]);
  expect(result.messages[0].content).toBe('answer');
  result = await preSend(converted, [...result.messages, { role: 'assistant', content: 'new' }], result.state);
  expect(result.messages[0].content).toBe('old answer');
  const restored = JSON.parse(JSON.stringify(result));
  const repeated = await preSend(converted, restored.messages, restored.state);
  expect(repeated.messages[0].content).toBe('old answer');
  expect(JSON.stringify(repeated.messages[0]._meta)).not.toContain('answer');
});

test.each([false, true])('runOnEdit=%s controls reapplication without retaining an original text copy', async runOnEdit => {
  const converted = card([regex({ placement: [1], findRegex: '^', replaceString: 'prefix ', runOnEdit })]);
  const first = await preSend(converted, [{ role: 'user', content: 'one' }]);
  const edited = [{ ...first.messages[0], content: 'two' }];
  const next = await preSend(converted, edited, first.state);
  expect(next.messages[0].content).toBe(runOnEdit ? 'prefix two' : 'two');
  const repeated = await preSend(converted, next.messages, next.state);
  expect(repeated.messages[0].content).toBe(next.messages[0].content);
});

test('retrying the original baseline is deterministic and updated rules invalidate old application markers', async () => {
  const converted = card([regex({ promptOnly: true, findRegex: '^', replaceString: 'A' })]);
  const baseline = [{ role: 'assistant', content: 'x' }];
  const first = await preSend(converted, baseline);
  const retry = await preSend(converted, baseline);
  expect(retry.messages).toEqual(first.messages);
  expect(baseline[0].content).toBe('x');
  const updated = card([regex({ promptOnly: true, findRegex: '^', replaceString: 'B' })]);
  const next = await preSend(updated, first.messages, first.state);
  expect(next.messages[0].content).toBe('BAx');
});

test('only reports unsupported active rules/placements and archives disabled malformed rules', () => {
  const converted = card([
    regex({ disabled: true, findRegex: '[' }), regex({ findRegex: '[' }),
    regex({ placement: [1, 5], promptOnly: true }), regex({ placement: [6] }),
    regex({ flags: 'ignored', findRegex: '/x/y' }), regex({ minDepth: '2' })
  ]);
  expect(converted.report.filter(item => item.code === 'regex_invalid').map(item => item.location))
    .toEqual([1, 4, 5].map(index => `data.extensions.regex_scripts[${index}]`));
  expect(converted.report.filter(item => item.code === 'regex_placement_unsupported')).toHaveLength(2);
  const mapping = JSON.parse(converted.files['import/manifest.json']).regex;
  expect(mapping.map(item => item.status)).toEqual(['disabled', 'skipped', 'converted', 'skipped', 'skipped', 'skipped']);
  expect(mapping[2].roles).toEqual(['user']);
  expect(converted.report.some(item => item.code === 'extension_unsupported')).toBe(false);
});
