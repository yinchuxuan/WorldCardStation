import { applyGameCard, applyGameCardAsync } from '../../src/renderer/gameCard/engine.js';

function withoutDurations(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => key === 'durationMs' ? undefined : item));
}

test.each([false, true])('sync and async actions share conditions, scoped find, groups and rollback (failure=%s)', async fail => {
  const card = { version: '1', id: 'parity', name: 'Parity', rules: [{
    when: { phase: 'pre_send' },
    find: [{ name: 'outer', from: { role: 'user' } }],
    then: [{
      when: { state: { 'temp.find.outer': 'hello' } }, then: [
        { type: 'state.set', path: 'score', value: 1 },
        { when: { state: { score: 1 } },
          find: [{ name: 'inner', from: { role: 'user' } }],
          then: [{ type: 'exec', source: 'state.captured = state.temp.find.inner; return { state };' }] },
        { when: { state: { score: 99 } }, then: [{ type: 'state.set', path: 'skipped', value: true }] },
        ...(fail ? [{ type: 'exec', source: 'throw Error("rollback");' }] : [])
      ]
    }]
  }] };
  const messages = [{ role: 'user', content: 'hello' }];
  const state = { score: 0, temp: { find: { saved: 'original' } } };
  const records = [];
  const observer = (...event) => records.push(JSON.parse(JSON.stringify(event)));
  const sync = applyGameCard({ card, phase: 'pre_send', messages, state, observer });
  const syncRecords = withoutDurations(records);
  records.length = 0;
  const asyncResult = await applyGameCardAsync({ card, phase: 'pre_send', messages, state, observer });
  expect(asyncResult.trace.errors).toEqual(fail ? ['rule[0] then: rollback'] : []);
  expect(withoutDurations(asyncResult)).toEqual(withoutDurations(sync));
  expect(withoutDurations(records).map(([type, details]) => [type, { ...details,
    error: details.error ? { ...details.error, stack: undefined } : undefined }]))
    .toEqual(syncRecords.map(([type, details]) => [type, { ...details,
      error: details.error ? { ...details.error, stack: undefined } : undefined }]));
  expect(asyncResult.state).toEqual(fail ? state : { ...state, score: 1, captured: 'hello' });
  expect(state.score).toBe(0);
});
