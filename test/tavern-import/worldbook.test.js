import { runtime, source } from './runtime.js';
import { prepareInitMessages, preparePreSendMessages } from '../../src/renderer/gameCard/sendPipeline.js';

const entry = (id, content, extra = {}) => ({ id, content, keys: ['key'], enabled: true, insertion_order: 100, ...extra });

test('worldbook keyword/body rendering happens before matching, recursion and outlet completion', async () => {
  const converted = runtime(source({ description: 'Character {{outlet::notes}}', post_history_instructions: 'Tail {{outlet::notes}}',
    character_book: { recursive_scanning: true, token_budget: 1000, entries: [
      entry(1, 'Hello {{char}} {{hidden_key:secret}}', { name: '角色', keys: ['{{user}}'], position: 'after_char' }),
      entry(2, '{{pick::one::two}}', { name: '角色', keys: ['secret'], extensions: { position: 7, outlet_name: 'notes' } })
    ] } }));
  const initialized = await prepareInitMessages(converted);
  const result = await preparePreSendMessages({ ...converted, state: initialized.state, messages: [{ role: 'user', content: 'User' }] });
  expect(result.trace.errors).toEqual([]);
  expect(converted.files['worldbook/entries/角色.md']).toContain('{{char}}');
  expect(converted.files['worldbook/entries/角色-2.md']).toBe('{{pick::one::two}}');
  const selected = result.trace.rules[0].actions[0].effects.worldbook.selected;
  expect(selected).toEqual(['1', '2']);
  const outlet = result.state.__worldbook.worldbook.outlets.notes;
  expect(result.messages.map(message => message.content)).toEqual([`Character ${outlet}`, 'Hello Alice ', 'User', `Tail ${outlet}`]);
  const next = await preparePreSendMessages({ ...converted, state: result.state, messages: [{ role: 'user', content: 'absent' }] });
  expect(next.messages.map(message => message.content)).toEqual(['Character ', 'absent', 'Tail ']);
  expect(next.state.__worldbook.worldbook.outlets).toEqual({});
});

test('V3 decorators and macros agree on the exact stripped body; writes stay inert', async () => {
  const converted = runtime(source({ character_book: { entries: [entry(0,
    '\n@@activate\n\nHi {{user}} {{setvar::bad::1}}\n', { name: 'CON', keys: [] })] } }, 'chara_card_v3'));
  const result = await preparePreSendMessages({ ...converted, messages: [{ role: 'user', content: 'x' }] });
  expect(result.trace.errors).toEqual([]);
  expect(result.messages.some(message => message.content === 'Hi User {{setvar::bad::1}}')).toBe(true);
  expect(result.state.__tavern.variables).toEqual({});
  expect(converted.files['worldbook/entries/条目-1.md']).toBeDefined();
  expect(converted.report.some(item => item.code === 'unsupported_macro')).toBe(true);
});

test('duplicate entry IDs fail and Unicode/case filenames remain distinct', () => {
  expect(() => runtime(source({ character_book: { entries: [entry('1', 'a'), entry(1, 'b')] } }))).toThrow('ID 重复');
  const converted = runtime(source({ character_book: { entries: [
    entry(1, 'a', { name: 'é' }), entry(2, 'b', { name: 'e\u0301' }), entry(3, 'c', { name: '../A' }), entry(4, 'd', { name: '../a' })
  ] } }));
  expect(Object.keys(converted.files).filter(path => path.startsWith('worldbook/entries/'))).toEqual([
    'worldbook/entries/é.md', 'worldbook/entries/é-2.md', 'worldbook/entries/..-A.md', 'worldbook/entries/..-a-2.md'
  ]);
});

test('thousand entries use a directory scope and load only matched body files', async () => {
  const converted = runtime(source({ character_book: { entries: Array.from({ length: 1000 }, (_, index) =>
    entry(index, `body ${index}`, { name: `Entry ${index}`, keys: [`unique-${index}-key`] })) } }));
  const originalRead = converted.platform.resources.readText;
  const readText = jest.fn(originalRead);
  const platform = { ...converted.platform, resources: { ...converted.platform.resources, readText } };
  const result = await preparePreSendMessages({ card: converted.card, platform, messages: [{ role: 'user', content: 'unique-501-key' }] });
  expect(result.trace.errors).toEqual([]);
  expect(result.messages.some(message => message.content === 'body 501')).toBe(true);
  expect(readText.mock.calls.filter(([, path]) => path.startsWith('worldbook/entries/'))).toHaveLength(1);
  expect(converted.card.files.worldbook).toEqual({ directory: 'worldbook', include: ['config.json', 'entries/*.md'] });
});

test('mapped assets are copied by resource ID and never autoplay or execute', () => {
  const converted = runtime(source({ assets: [
    { type: 'background', name: 'main', ext: 'png', uri: 'embeded://a.png' },
    { type: 'other', name: 'script', ext: 'js', uri: 'embeded://a.js' },
    { type: 'icon', name: 'main', ext: 'png', uri: 'https://example.com/avatar.png' }
  ] }, 'chara_card_v3'), { resources: [ { id: 'r0', uri: 'embeded://a.png' }, { id: 'r1', uri: 'embeded://a.js' } ] });
  expect(converted.copies).toEqual([{ resourceId: 'r0', path: 'assets/asset-1.png' }, { resourceId: 'r1', path: 'assets/asset-2.js' }]);
  expect(converted.card.visual.background).toEqual({ 'asset-1': 'assets/asset-1.png' });
  expect(converted.card.ui).toBeUndefined();
  expect(converted.card.audio).toBeUndefined();
  expect(converted.report.some(item => item.code === 'asset_unavailable')).toBe(true);
});
