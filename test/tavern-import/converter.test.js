import { convertTavernCard } from '../../src/shared/tavern-import/convert.js';
import { source, runtime } from './runtime.js';
import { prepareInitMessages, preparePreSendMessages } from '../game-card/legacyPipelineHarness.js';

describe('Tavern card compiler', () => {
  test('maps definitions, original prompts, examples and a real greeting into ordinary rules', async () => {
    const converted = runtime(source({ description: '{{char}} with {{user}}', personality: 'Kind', scenario: 'School',
      system_prompt: '{{original}} + card', post_history_instructions: 'tail {{original}}',
      first_mes: 'Hello {{user}}', alternate_greetings: ['Other'],
      mes_example: '<START>\n{{user}}: Hi\n{{char}}: Hello\nsecond line', creator_notes: 'Not a prompt' }),
    { options: { userName: 'Bob', mainPrompt: 'main', postHistoryPrompt: 'default-tail' } });
    const initialized = await prepareInitMessages(converted);
    expect(initialized.trace.errors).toEqual([]);
    expect(initialized.messages).toHaveLength(1);
    expect(initialized.messages[0]).toMatchObject({ role: 'assistant', content: 'Hello Bob' });
    expect(initialized.messages[0].ttl).toBeUndefined();
    const messages = [...initialized.messages, { role: 'user', content: 'Go' }];
    const sent = await preparePreSendMessages({ ...converted, messages, state: initialized.state });
    expect(sent.trace.errors).toEqual([]);
    expect(sent.messages.map(message => message.content)).toEqual([
      'main + card', 'Alice with Bob', 'Kind', 'School', 'Hi', 'Hello\nsecond line', 'Hello Bob', 'Go', 'tail default-tail'
    ]);
    expect(sent.messages[4]).toMatchObject({ role: 'user', ttl: 1, _meta: { visibility: 'llm_only' } });
    expect(sent.messages.some(message => message.content.includes('Not a prompt'))).toBe(false);
    const repeated = await preparePreSendMessages({ ...converted, messages: sent.messages, state: sent.state });
    expect(repeated.messages.map(message => message.content)).toEqual(sent.messages.map(message => message.content));
    expect(JSON.parse(converted.files['files.json']).worldbook).toBeUndefined();
  });

  test('empty greeting still persists state-only initialization once', async () => {
    const converted = runtime(source({ first_mes: '{{setvar::x::1}}' }));
    const initialized = await prepareInitMessages(converted);
    expect(initialized.trace.errors).toEqual([]);
    expect(initialized.messages).toEqual([]);
    expect(initialized.changed).toBe(true);
    const repeated = await prepareInitMessages({ ...converted, state: initialized.state });
    expect(repeated.changed).toBe(false);
    expect(repeated.state).toEqual(initialized.state);
  });

  test('validates source types, versions, options and output identity', () => {
    expect(() => convertTavernCard({ source: source(), id: '../bad' })).toThrow('ID');
    expect(() => runtime(source({ description: {} }))).toThrow('description');
    expect(() => runtime(source({ tags: [1] }))).toThrow('tags');
    expect(() => runtime(source({ character_book: { entries: [], token_budget: '100' } }))).toThrow('token_budget');
    expect(() => runtime(source({ character_book: { entries: [{ id: 1, content: 'x', enabled: 'false' }] } }))).toThrow('enabled');
    expect(() => runtime(source(), { options: { greetingIndex: 1 } })).toThrow('开场白');
    expect(() => runtime({ ...source(), spec: 'unknown' })).toThrow('V2/V3');
    const future = runtime({ ...source(), spec_version: '9.0' });
    expect(future.report).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'spec_version' })]));
  });

  test('keeps provenance unregistered and V3 nickname/greeting choice explicit', async () => {
    const original = source({ nickname: 'Ali', first_mes: 'first', alternate_greetings: ['{{char}}'],
      extensions: { plugin: { script: 'throw new Error("must not execute")' } } }, 'chara_card_v3');
    const converted = runtime(original, { options: { greetingIndex: 1 } });
    expect(JSON.parse(converted.files['import/original.json'])).toEqual(original);
    expect(JSON.stringify(converted.card.files)).not.toContain('import/');
    const initialized = await prepareInitMessages(converted);
    expect(initialized.messages[0].content).toBe('Ali');
    expect(converted.report.some(item => item.code === 'extensions_archived')).toBe(true);
  });

  test.each(['chara_card_v2', 'chara_card_v3'])('%s treats a null nickname as missing without mutating the source', async spec => {
    const original = source({ nickname: null, first_mes: 'Hello {{char}}', description: '{{char}}',
      mes_example: '<START>\nAlice: Example' }, spec);
    Object.freeze(original.data);
    const converted = runtime(original);
    expect(original.data.nickname).toBeNull();
    expect(JSON.parse(converted.files['import/original.json'])).toEqual(original);
    expect(JSON.parse(converted.files['content/settings.json']).character.nickname).toBe('Alice');
    expect(converted.report).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'default_field', location: 'data.nickname', severity: 'info' })
    ]));
    expect(converted.report.every(item => item.severity === 'info')).toBe(true);
    const initialized = await prepareInitMessages(converted);
    expect(initialized.trace.errors).toEqual([]);
    expect(initialized.state.__tavern.character).toBe('Alice');
    expect(initialized.messages[0].content).toBe('Hello Alice');
    const sent = await preparePreSendMessages({ ...converted, messages: initialized.messages, state: initialized.state });
    expect(sent.trace.errors).toEqual([]);
    expect(sent.messages.map(message => message.content)).toEqual(['Alice', 'Example', 'Hello Alice']);
    expect(sent.messages[1].role).toBe('assistant');
  });

  test.each([undefined, ''])('keeps the existing nickname fallback for %p', nickname => {
    const converted = runtime(source({ nickname }));
    expect(JSON.parse(converted.files['content/settings.json']).character.nickname).toBe('Alice');
  });

  test.each([0, 123, false, true, {}, []])('still rejects a non-string nickname %p', nickname => {
    expect(() => runtime(source({ nickname }))).toThrow('data.nickname 必须是字符串');
  });
});
