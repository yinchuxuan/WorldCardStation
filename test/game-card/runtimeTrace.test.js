import { applyGameCard, applyGameCardAsync } from '../../src/renderer/gameCard/engine.js';
import { createTraceRecorder, messageChanges, stateChanges } from '../../src/shared/game-card/trace/changes.js';
import { matchesWhen } from '../../src/shared/game-card/engine/predicate.js';
import { preparePreSendMessages } from '../game-card/legacyPipelineHarness.js';

const card = rules => ({ id: 'trace', version: '1', name: 'Trace', rules });
const rule = then => ({ when: { phase: 'pre_send' }, then });
const input = { messages: [{ role: 'user', content: 'hello' }], state: {} };
function recorder(initial = input) {
  const events = [];
  return { events, observer: createTraceRecorder(event => events.push(event), initial) };
}

test('exact deltas retain hidden bodies, metadata, order and missing versus null', () => {
  const a = { role: 'system', content: 'secret', ttl: 2, _meta: { visibility: 'llm_only', nested: [1] } };
  expect(messageChanges([], [a])).toEqual({ operation: 'splice', index: 0, removed: [], added: [a] });
  expect(messageChanges([a, input.messages[0]], [input.messages[0], a], true))
    .toEqual({ operation: 'replace', before: [a, input.messages[0]], after: [input.messages[0], a] });
  expect(stateChanges({ 'a/b': null, nested: { score: 1 } }, { nested: { score: 2 }, empty: null })).toEqual([
    { path: '/a~1b', hasBefore: true, hasAfter: false, before: null },
    { path: '/nested/score', before: 1, after: 2 },
    { path: '/empty', hasBefore: false, hasAfter: true, after: null }
  ]);
});

test.each([applyGameCard, applyGameCardAsync])('records transient changes even when a later action fails (%#)', async execute => {
  const trace = recorder();
  const source = card([rule([
    { type: 'insert', role: 'system', content: 'insert then delete', ttl: 2, _meta: { visibility: 'llm_only' } },
    { type: 'remove', predicate: { role: 'system' } },
    { when: { state: { missing: { exists: false } } }, then: [
      { type: 'state.set', path: 'turn', value: 2 },
      { type: 'exec', source: 'throw new Error("broken");' }
    ] }
  ]), rule([{ type: 'state.set', path: 'recovered', value: true }])]);
  const baseline = await execute({ card: source, phase: 'pre_send', ...input });
  const result = await execute({ card: source, phase: 'pre_send', ...input, observer: trace.observer });
  expect(result).toEqual(baseline);
  expect(result.state).toEqual({ recovered: true });
  expect(trace.events.find(event => event.type === 'action.end' && event.actionType === 'insert').changes.messages.added[0])
    .toMatchObject({ content: 'insert then delete', ttl: 2, _meta: { visibility: 'llm_only' } });
  expect(trace.events.find(event => event.type === 'action.end' && event.actionType === 'remove').changes.messages.removed)
    .toHaveLength(1);
  expect(trace.events.find(event => event.type === 'action.start' && event.actionType === 'exec').pointer)
    .toBe('/rules/0/then/2/then/1');
  expect(trace.events.find(event => event.type === 'rule.rollback').changes.state)
    .toContainEqual({ path: '/turn', hasBefore: true, hasAfter: false, before: 2 });
});

test('find creates, shadows and restores local state; unchanged actions are visible', async () => {
  const snapshot = { ...input, state: { temp: { find: { text: 'outer' } } } };
  const trace = recorder(snapshot);
  await applyGameCardAsync({ card: card([{
    ...rule([{ type: 'state.set', path: 'saved', value: true }, { type: 'remove', predicate: { role: 'assistant' } }]),
    find: [{ name: 'text', from: { role: 'user' } }]
  }]), phase: 'pre_send', ...snapshot, observer: trace.observer });
  expect(trace.events.find(event => event.type === 'find.enter')).toMatchObject({
    persistence: 'local', changes: { state: [{ path: '/temp/find/text', before: 'outer', after: 'hello' }] }
  });
  expect(trace.events.find(event => event.type === 'find.restore').changes.state)
    .toEqual([{ path: '/temp/find/text', before: 'hello', after: 'outer' }]);
  expect(trace.events.find(event => event.type === 'action.end' && event.actionType === 'remove'))
    .toMatchObject({ changes: { messages: null, state: [] }, result: { matched: 0, applied: false } });
});

test('conditions report actual values and short circuit without evaluating again', () => {
  const events = [];
  const state = { score: 2 };
  const getter = jest.fn(() => 3);
  Object.defineProperty(state, 'untouched', { get: getter });
  expect(matchesWhen({ phase: 'pre_send', state: { score: 5, untouched: 3 } }, 'pre_send', [], state,
    event => events.push(event))).toBe(false);
  expect(getter).not.toHaveBeenCalled();
  expect(events).toContainEqual(expect.objectContaining({ path: '/state/score', result: false, actual: { exists: true, value: 2 } }));
  expect(events).toContainEqual(expect.objectContaining({ path: '/state/untouched', status: 'not_evaluated' }));
});

test('TTL and state defaults are separate platform steps and snapshots are detached', async () => {
  const snapshot = { messages: [{ role: 'system', content: 'expires', ttl: 1 }], state: {} };
  const trace = recorder(snapshot);
  await preparePreSendMessages({ card: card([]), ...snapshot, observer: trace.observer });
  snapshot.messages[0].content = 'mutated';
  expect(trace.events.map(event => event.type)).toEqual(['state.defaults', 'messages.ttl']);
  expect(trace.events[1].changes.messages.removed[0].content).toBe('expires');
});

test('recording failures are reported and cannot throw into game logic', () => {
  const failure = jest.fn();
  const observe = createTraceRecorder(() => { throw Error('disk full'); }, input, failure);
  expect(() => observe('step', {}, [], { score: 2 })).not.toThrow();
  expect(failure).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }));
});
