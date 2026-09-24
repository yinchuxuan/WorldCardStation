import { runtime, rule, barrier, consume } from './agentRuntimeHelpers.js';

test('raw output arrives before done and remains separate from async post_response', async () => {
  const token = barrier();
  const finish = barrier();
  const post = barrier();
  const enteredPost = barrier();
  const app = runtime({ a: { rules: [rule('post_response', [{ type: 'exec', source: 'return {};' }])] } }, async (_, cb) => {
    cb.onToken('first'); token.resolve();
    await finish.promise;
    cb.onToken('last');
  }, { dependencies: { runExecAction: async (messages, state) => {
    enteredPost.resolve(); await post.promise;
    return { messages: messages.map(msg => ({ ...msg, content: 'rewritten' })), state, trace: { applied: true } };
  } } });
  await app.initialize();
  const call = app.agents.call('a');
  const reader = call.response[Symbol.asyncIterator]();
  await token.promise;
  expect(await reader.next()).toEqual({ value: 'first', done: false });
  expect(() => app.agents.call('a')).toThrow('still running');
  finish.resolve(); await enteredPost.promise;
  expect(await reader.next()).toEqual({ value: 'last', done: false });
  expect(await reader.next()).toEqual({ done: true, value: undefined });
  expect(() => app.agents.call('a')).toThrow('still running');
  post.resolve(); await call.done();
  expect(app.agents.messages('a')[0].content).toBe('rewritten');
});

test('cancellation settles uncooperative transport and fences late callbacks', async () => {
  const entered = barrier();
  const release = barrier();
  let oldCallbacks;
  const app = runtime({ a: { rules: [rule('init', [{ type: 'state.inc', path: 'count', value: 1 }])] }, b: {} },
    async ({ agentId }, callbacks) => {
      if (agentId === 'b') return callbacks.onToken('new');
      oldCallbacks = callbacks;
      callbacks.onToken('partial'); entered.resolve(); await release.promise;
    });
  await app.initialize();
  const first = app.agents.call('a');
  await entered.promise;
  expect(() => app.state.set('count', 8)).toThrow('during an Agent call');
  app.cancel();
  await expect(first.done()).rejects.toThrow('cancelled');
  await expect(consume(first.response)).rejects.toThrow('cancelled');
  expect(app.state.get('count')).toBe(1);
  expect(app.agents.messages('a')).toEqual([]);
  await app.agents.call('b').done();
  expect(() => oldCallbacks.onToken('late')).toThrow('cancelled');
  release.resolve();
  await Promise.resolve();
  expect(app.agents.messages('b')[0].content).toBe('new');
  app.stop();
  expect(() => app.agents.call('b')).toThrow('stopped');
  expect(() => app.state.set('count', 4)).toThrow('stopped');
});

test('cancel during exec ignores result and retry runs init again', async () => {
  const entered = barrier();
  const release = barrier();
  let attempts = 0;
  const app = runtime({ a: { rules: [rule('init', [{ type: 'exec', source: 'return {};' }])] } }, undefined, {
    dependencies: { runExecAction: async (messages, state) => {
      attempts += 1;
      if (attempts === 1) { entered.resolve(); await release.promise; }
      return { messages, state: { ...state, count: attempts }, trace: { applied: true } };
    } }
  });
  const first = app.initialize(); await entered.promise;
  app.cancel();
  await expect(first).rejects.toThrow('cancelled');
  await app.initialize();
  await app.agents.call('a').done();
  release.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(app.state.get('count')).toBe(2);
  expect(app.agents.messages('a')).toHaveLength(1);
});

test('transport errors preserve previous successful Agent state and histories', async () => {
  const app = runtime({ a: {}, b: {} }, async ({ agentId }, cb) => {
    if (agentId === 'b') throw new Error('offline');
    cb.onToken('<state_patch>{"count":3}</state_patch>');
  });
  await app.initialize();
  await app.agents.call('a').done();
  const call = app.agents.call('b');
  await expect(call.done()).rejects.toThrow('Agent b: offline');
  await expect(consume(call.response)).rejects.toThrow('offline');
  expect(app.state.get('count')).toBe(3);
  expect(app.agents.messages('a')).toHaveLength(1);
  expect(app.agents.messages('b')).toEqual([]);
});
