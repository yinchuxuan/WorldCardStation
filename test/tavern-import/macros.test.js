import { runtime, source } from './runtime.js';
import { prepareInitMessages, preparePreSendMessages } from '../../src/renderer/gameCard/sendPipeline.js';
import { buildRetryMessages } from '../../src/renderer/chat/chatGeneration.js';

test('variable writes and nested reads execute in order with safe names', async () => {
  const converted = runtime(source({ first_mes: '{{setvar::__proto__::2}}{{incvar::__proto__}}/{{getvar::__proto__}}',
    description: '{{setvar::name::Hi {{user}}}}{{getvar::name}} {{addvar::__proto__::3}}{{getvar::__proto__}}' }));
  const initialized = await prepareInitMessages(converted);
  expect(initialized.messages[0].content).toBe('3/3');
  const messages = [...initialized.messages, { role: 'user', content: 'Go' }];
  const sent = await preparePreSendMessages({ ...converted, messages, state: initialized.state });
  expect(sent.trace.errors).toEqual([]);
  expect(sent.messages[0].content).toBe('Hi User 6');
  expect(sent.state.__tavern.variables).toEqual({ v0: 'Hi User', v1: 6 });
  const retried = await preparePreSendMessages({ ...converted, messages: buildRetryMessages(sent.messages, messages), state: initialized.state });
  expect(retried.state).toEqual(sent.state);
  expect(retried.messages.some(message => message.content === '3/3')).toBe(true);
});

test('stable pick does not change when real history grows; greeting is not rerun', async () => {
  const converted = runtime(source({ first_mes: '{{pick::A::B::C}}', description: '{{pick::one::two::three}} {{roll:d6}}' }));
  const initialized = await prepareInitMessages(converted);
  const first = await preparePreSendMessages({ ...converted, messages: initialized.messages, state: initialized.state });
  const next = await preparePreSendMessages({ ...converted, messages: [...first.messages, { role: 'user', content: 'next' }], state: first.state });
  expect(next.messages[0].content.split(' ')[0]).toBe(first.messages[0].content.split(' ')[0]);
  const reloaded = await prepareInitMessages({ ...converted, messages: next.messages, state: next.state });
  expect(reloaded.messages).toEqual(next.messages);
});

test('unknown nested/scoped macros are opaque and malicious text stays data', async () => {
  const text = '{{unknown::{{setvar::bad::1}}}} {{if false}}{{setvar::bad::2}}{{/if}}\n' +
    '"; throw new Error("injected"); // eval Function {{state:private}}';
  const converted = runtime(source({ first_mes: text }));
  const initialized = await prepareInitMessages(converted);
  expect(initialized.trace.errors).toEqual([]);
  expect(initialized.messages[0].content).toBe(text);
  expect(initialized.state.__tavern.variables).toEqual({});
  expect(converted.report.filter(item => item.code === 'unsupported_macro')).toHaveLength(3);
  expect(converted.files['scripts/render-0.js']).not.toMatch(/\b(eval|Function)\b/);
});

test('compiled template edits fail explicitly instead of using stale spans', async () => {
  const converted = runtime(source({ first_mes: '{{char}}' }));
  const platform = { ...converted.platform, resources: { ...converted.platform.resources,
    readText: async (id, path) => path === 'content/greeting-0.md' ? 'changed {{user}}' : converted.files[path] } };
  const result = await prepareInitMessages({ card: converted.card, platform });
  expect(result.trace.errors.join('\n')).toContain('文本已修改');
  expect(result.messages).toEqual([]);
});

test('unsupported nested condition blocks do not partially execute any branch', async () => {
  const text = '{{if false}}{{if true}}inside{{/if}}{{setvar::bad::1}}{{/if}}';
  const converted = runtime(source({ first_mes: text, system_prompt: '{{original}}' }), { options: { mainPrompt: 'Default {{char}}' } });
  const initialized = await prepareInitMessages(converted);
  expect(initialized.messages[0].content).toBe(text);
  expect(initialized.state.__tavern.variables).toEqual({});
  const sent = await preparePreSendMessages({ ...converted, messages: initialized.messages, state: initialized.state });
  expect(sent.messages[0].content).toBe('Default Alice');
});
