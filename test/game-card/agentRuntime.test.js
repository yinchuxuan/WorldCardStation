import { runtime, rule, insert, consume } from './agentRuntimeHelpers.js';

test('call cannot implicitly initialize an Agent', async () => {
  const generate = jest.fn();
  const app = runtime({ a: { rules: [rule('init', [insert('ready')])] } }, generate);
  expect(() => app.agents.call('a')).toThrow('initialized');
  expect(app.agents.messages('a')).toEqual([]);
  await app.initialize();
  await app.initialize();
  expect(app.agents.messages('a').map(msg => msg.content)).toEqual(['ready']);
  expect(generate).not.toHaveBeenCalled();
});

test('hidden sequential Agents share State, not contexts, and preserve raw versus final messages', async () => {
  const requests = [];
  const app = runtime({
    judge: { rules: [rule('init', [insert('judge')]), rule('post_response', [
      { type: 'replace', predicate: { role: 'assistant' }, content: 'final judgment' }
    ])] },
    narrator: { rules: [rule('pre_send', [insert('count={{state:count}} / {{state:temp.find.verdict}}')], {
      find: [{ name: 'verdict', agentId: 'judge', from: { role: 'assistant', index: 'last' } }]
    })] }
  }, async (request, callbacks) => {
    requests.push(request);
    callbacks.onThinkingToken?.('private reasoning');
    callbacks.onToken(request.agentId === 'judge'
      ? 'raw<state_patch>{"type":"state.inc","path":"count","value":1}</state_patch>'
        + '<state_patch_stream>{"count":99}</state_patch_stream>' : 'narration');
  });
  await app.initialize();
  const first = app.agents.call('judge');
  const old = app.agents.messages('judge');
  await first.done();
  await first.done();
  expect(app.state.get('count')).toBe(1);
  expect(old.map(msg => msg.content)).toEqual(['judge']);
  expect(await consume(first.response)).toContain('raw<state_patch>');
  expect(() => first.response[Symbol.asyncIterator]()).toThrow('one consumer');
  const final = app.agents.messages('judge').find(msg => msg.id === first.messageId);
  expect(final).toMatchObject({ content: 'final judgment', thinking: 'private reasoning' });
  expect(Object.isFrozen(final)).toBe(true);
  await app.agents.call('narrator').done();
  expect(requests[1].messages[0].content).toBe('count=1 / final judgment');
  expect(app.state.has('temp.find')).toBe(false);
  expect(app.agents.messages('judge')).toHaveLength(2);
  expect(app.agents.messages('narrator')).toHaveLength(2);
});

test('init runs once up front; TTL advances only for the called Agent', async () => {
  const requests = [];
  const app = runtime({ a: { rules: [
    rule('init', [{ type: 'state.inc', path: 'count', value: 1 }]),
    rule('pre_send', [insert('temporary', { ttl: 2 })]),
    rule('post_response', [{ type: 'remove', predicate: { role: 'assistant' } }])
  ] }, b: { rules: [rule('post_response', [{ type: 'remove', predicate: {} }])] } }, async (request, cb) => {
    requests.push(request);
    cb.onToken('response');
  });
  await app.initialize();
  const first = app.agents.call('a');
  await first.done();
  const temporary = app.agents.messages('a')[0];
  await app.agents.call('b').done();
  expect(app.agents.messages('a')[0].ttl).toBe(2);
  expect(app.agents.messages('a').find(msg => msg.id === first.messageId)).toBeUndefined();
  await app.agents.call('a').done();
  expect(app.agents.messages('a')[0]).toEqual({ ...temporary, ttl: 1 });
  await app.agents.call('a').done();
  expect(app.agents.messages('a').some(msg => msg.id === temporary.id)).toBe(false);
  expect(app.state.get('count')).toBe(1);
  expect(new Set(app.agents.messages('a').map(msg => msg.id)).size).toBe(2);
});

test('nested rules query current own Messages, cross-Agent defaults, and apply JS changes', async () => {
  const app = runtime({ a: { rules: [rule('pre_send', [{ then: [
    insert('first'), insert('{{state:temp.find.own}}/{{state:temp.find.other}}', {
      find: [
        { name: 'own', agentId: 'a', from: { index: 'last' } },
        { name: 'other', agentId: 'b', from: {}, default: 'empty' }
      ]
    }), { type: 'exec', source: 'return { messages, state };' }
  ] }])] }, b: {} }, undefined, { dependencies: {
    runExecAction: (messages, state) => ({ messages, state: { ...state, count: 5 }, trace: { applied: true } })
  } });
  await app.initialize();
  await app.agents.call('a').done();
  expect(app.agents.messages('a').map(msg => msg.content)).toEqual(['first', 'first/empty', 'answer']);
  expect(app.state.get('count')).toBe(5);
});

test('rule errors fail call, do not send model or leave init/State partial changes', async () => {
  const generate = jest.fn();
  const app = runtime({ a: { rules: [rule('init', [
    { type: 'state.inc', path: 'count', value: 1 },
    { type: 'state.set', path: 'count', value: 'invalid' }
  ])] } }, generate);
  await expect(app.initialize()).rejects.toThrow();
  expect(generate).not.toHaveBeenCalled();
  expect(app.state.get('count')).toBe(0);
  expect(app.agents.messages('a')).toEqual([]);
  expect(() => app.agents.call('missing')).toThrow('unknown Agent');
  expect(() => app.agents.messages('constructor')).toThrow('unknown Agent');
});

test.each([
  messages => [{ ...messages[0], id: 'forged' }],
  messages => [messages[0], messages[0]],
  () => [{ role: 'wrong', content: '' }]
])('exec cannot return forged/duplicate IDs or invalid messages', async change => {
  const app = runtime({ a: { rules: [rule('pre_send', [insert('seed'), { type: 'exec', source: 'return {};' }])] } },
    undefined, { dependencies: { runExecAction: messages => ({ messages: change(messages), trace: { applied: true } }) } });
  await app.initialize();
  await expect(app.agents.call('a').done()).rejects.toThrow();
  expect(app.agents.messages('a')).toEqual([]);
});

test('an empty history does not reinitialize a successful Agent', async () => {
  const app = runtime({ a: { rules: [
    rule('init', [{ type: 'state.inc', path: 'count', value: 1 }]),
    rule('post_response', [{ type: 'remove', predicate: { all: true } }])
  ] } });
  await app.initialize();
  await app.agents.call('a').done();
  expect(app.agents.messages('a')).toEqual([]);
  await app.agents.call('a').done();
  expect(app.state.get('count')).toBe(1);
});
