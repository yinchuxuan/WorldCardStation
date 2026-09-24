import { runtime, rule, consume } from './agentRuntimeHelpers.js';
import { createSharedState } from '../../src/shared/game-card/runtime/sharedState.js';

const contract = { id: 'required', type: 'content.regex', pattern: 'required', matches: { eq: 1 }, message: 'missing required' };

test('retry validation rejects without transparent regeneration or patch/post_response effects', async () => {
  const generate = jest.fn(async (_, cb) => cb.onToken('<state_patch>{"count":8}</state_patch>'));
  const app = runtime({ a: { responseValidation: { rules: [contract], maxRetries: 3 },
    rules: [rule('post_response', [{ type: 'state.inc', path: 'count', value: 10 }])] } }, generate);
  await app.initialize();
  const call = app.agents.call('a');
  await expect(call.done()).rejects.toThrow('missing required');
  expect(generate).toHaveBeenCalledTimes(1);
  expect(app.state.get('count')).toBe(0);
  expect(app.agents.messages('a')).toEqual([]);
  expect(await consume(call.response)).toContain('state_patch');
});

test('warn accepts; validation sees ordinary patch candidate but not reading-time patches', async () => {
  const app = runtime({ a: { responseValidation: { onFailure: 'warn', rules: [contract, {
    id: 'increment', type: 'state.update', path: 'count', updates: { eq: 1 }, delta: { eq: 2 }, message: 'wrong delta'
  }] }, rules: [rule('post_response', [{ type: 'state.inc', path: 'count', value: 1 }])] } }, async (_, cb) => {
    cb.onToken('<state_patch_stream>not JSON, required</state_patch_stream>');
    cb.onToken('<state_patch>{"type":"state.inc","path":"count","value":2}</state_patch>');
  });
  await app.initialize();
  await app.agents.call('a').done();
  expect(app.state.get('count')).toBe(3);
  expect(app.agents.messages('a')[0]._meta.validationWarnings).toMatchObject([{ id: 'required' }]);
});

test.each([
  '<state_patch>{bad}</state_patch>',
  '<state_patch>{"unknown":5}</state_patch>',
  '<state_patch>{"count":"bad"}</state_patch>',
  '<state_patch>{"count":1}</state_patch><state_patch>{"count":"bad"}</state_patch>',
  '<state_patch>{"count":1}',
  '<state_patch><state_patch_stream></state_patch_stream></state_patch>',
  '</state_patch>',
  '<state_patch></state_patch_stream>'
])('bad control data rejects atomically: %s', async text => {
  const app = runtime({ a: {} }, async (_, cb) => cb.onToken(text));
  await app.initialize();
  await expect(app.agents.call('a').done()).rejects.toThrow();
  expect(app.state.get('count')).toBe(0);
  expect(app.agents.messages('a')).toEqual([]);
});

test('shared State snapshots, defaults, clamps, missing deletes and parent constraint enforcement', () => {
  const store = createSharedState({
    count: { type: 'number', default: 2, min: 0, max: 4, onInvalid: 'clamp' },
    'nested.value': { type: 'number' }
  }, { nested: { value: 1 } });
  const value = store.api.get('nested'); value.value = 20;
  expect(store.api.get('nested.value')).toBe(1);
  expect(store.api.get('missing')).toBeUndefined();
  expect(store.api.has('missing')).toBe(false);
  expect(store.api.delete('missing')).toBeUndefined();
  store.api.set('count', 99);
  expect(store.api.get('count')).toBe(4);
  expect(() => store.api.set('nested', { value: 'bad' })).toThrow('nested.value');
  expect(store.api.get('nested.value')).toBe(1);
  store.api.delete('count');
  expect(store.api.has('count')).toBe(false);
  expect(() => store.api.set('__proto__.polluted', true)).toThrow('invalid State path');
  expect(() => store.api.set('x', undefined)).toThrow('JSON');
  expect(() => store.api.set('x', NaN)).toThrow('JSON');
});

test('model patches cannot bypass llmWrite through ancestor or descendant writes', () => {
  const store = createSharedState({
    data: { type: 'object', default: { protected: 1 } },
    'data.protected': { type: 'number', llmWrite: false }
  });
  for (const patch of [{ 'data.protected': 2 }, { data: {} }, { 'data.protected.child': 1 }]) {
    expect(() => store.patch(JSON.stringify(patch))).toThrow('LLM cannot write');
  }
  store.api.set('data.protected', 2);
  expect(store.api.get('data.protected')).toBe(2);
  expect(store.patch('{"data.allowed":1}').state.data.allowed).toBe(1);
});
