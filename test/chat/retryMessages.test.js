import { buildRetryMessages } from '../../src/renderer/chat/retryMessages.js';
import { preparePreSendMessages } from '../game-card/legacyPipelineHarness.js';

test('retry preserves TTL, metadata, trailing messages and independently clones the snapshot', () => {
  const snapshot = [
    { role: 'system', content: 'permanent', ttl: -1 },
    { role: 'system', content: 'five turns', ttl: 5 },
    { id: 'user', role: 'user', content: 'original', _meta: { custom: { a: 1 } } },
    { role: 'system', content: 'trailing', ttl: 1 }
  ];
  const current = [{ id: 'user', role: 'user', content: 'transformed' }, { role: 'assistant', content: 'answer' }];
  const restored = buildRetryMessages(current, snapshot);
  expect(restored).toEqual(snapshot);
  const edited = buildRetryMessages(current, snapshot, 'edited');
  expect(edited).toEqual(snapshot.map(msg => msg.role === 'user' ? { ...msg, content: 'edited' } : msg));
  restored[2]._meta.custom.a = 9;
  expect(snapshot[2]._meta.custom.a).toBe(1);
  expect(snapshot[2].content).toBe('original');
});

test('retry without a snapshot clones current history without stripping card text', () => {
  const current = [{ role: 'user', content: 'raw', _meta: { nested: { a: 1 } } }, { role: 'assistant', content: 'answer' }];
  const restored = buildRetryMessages(current, null);
  expect(restored).toEqual([current[0]]);
  restored[0]._meta.nested.a = 2;
  expect(current[0]._meta.nested.a).toBe(1);
});

test('repeated retry decays TTL once from the same snapshot, keeping permanent messages', async () => {
  const card = { version: '1', id: 'ttl', name: 'TTL', rules: [] };
  const snapshot = [{ role: 'system', content: 'permanent', ttl: -1 },
    { role: 'system', content: 'hint', ttl: 5 }, { role: 'user', content: 'input' }];
  const expected = [snapshot[0], { ...snapshot[1], ttl: 4 }, snapshot[2]];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await preparePreSendMessages({ card, messages: buildRetryMessages(snapshot, snapshot) });
    expect(result.messages).toEqual(expected);
  }
  expect(snapshot[1].ttl).toBe(5);
});
