import { createWebSessions } from '../../../src/web/sessions.js';
import { randomUUID } from 'crypto';
import { validateSession } from '../../../src/web/sessionSnapshot.js';
beforeAll(() => { crypto.randomUUID = randomUUID; });

function fixture() {
  const records = new Map();
  const copy = value => value && JSON.parse(JSON.stringify(value));
  const store = { get: jest.fn(async key => copy(records.get(key))),
    update: jest.fn(async (key, fn) => { const next = fn(copy(records.get(key))); records.set(key, copy(next)); return next; }) };
  let reference = null;
  const create = (options = {}) => createWebSessions({ scope: async () => reference, store, selection: null, ...options });
  return { create, store, setScope: key => { reference = key ? { key } : null; } };
}
const messages = [{ id: 'u', role: 'user', content: 'test', _meta: { ttl: 2 } }];
test('full snapshot round trip, explicit target and compare-and-swap conflict', async () => {
  const { create } = fixture(), a = create(), b = create();
  const first = await a.loadHistory(), stale = await b.loadHistory();
  const options = { gameState: { score: 7 }, retryBaseMessages: messages, retryBaseState: { score: 2 },
    viewState: { reading: { messageId: 'u', segmentIndex: 2 } }, saveTarget: first.saveTarget };
  const saved = await a.saveHistory(messages, options);
  expect(saved.saveTarget.revision).toBe(1);
  await expect(b.saveHistory([], { saveTarget: stale.saveTarget })).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });
  expect(await b.loadHistory()).toMatchObject({ ...options, messages, saveTarget: saved.saveTarget });
});
test('deleting inactive/current/last sessions updates selection and exits only an empty card scope', async () => {
  const { create, setScope } = fixture(), onEmpty = jest.fn(), service = create({ onEmpty });
  setScope('card');
  const first = await service.loadHistory(), second = await service.create('second');
  await service.delete(first.saveTarget.id);
  expect(await service.getActive()).toEqual(second);
  expect(onEmpty).not.toHaveBeenCalled();
  await service.delete(second.id);
  expect(onEmpty).toHaveBeenCalledTimes(1);
  expect(onEmpty).toHaveBeenCalledWith({ key: 'card' });
  expect(await service.list()).toEqual({ activeId: null, sessions: [] });
  expect(await service.loadHistory()).toMatchObject({ sessionMissing: true });
  setScope(null);
  const ordinary = await service.loadHistory();
  await service.delete(ordinary.saveTarget.id);
  expect(onEmpty).toHaveBeenCalledTimes(1);
});
test('scope switching cannot redirect delayed saves and deletion cannot resurrect a session', async () => {
  const { create, setScope } = fixture(), service = create();
  const ordinary = await service.loadHistory();
  setScope('source/card/release1');
  const game = await service.loadHistory();
  await service.saveHistory(messages, { saveTarget: ordinary.saveTarget });
  expect((await service.loadHistory()).messages).toEqual([]);
  await service.delete(game.saveTarget.id);
  await expect(service.saveHistory(messages, { saveTarget: game.saveTarget })).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });
  expect((await service.list()).sessions).toEqual([]);
  setScope(null);
});
test('new, switch and rename keep independent snapshots; failed writes retain old data', async () => {
  const { create, store } = fixture(), service = create();
  const first = await service.loadHistory();
  const second = await service.create('second');
  await service.rename(second.id, 'renamed');
  expect((await service.list()).sessions[1].title).toBe('renamed');
  await service.setActive(first.saveTarget.id);
  store.update.mockRejectedValueOnce(new Error('quota'));
  await expect(service.saveHistory(messages, { saveTarget: first.saveTarget })).rejects.toThrow('quota');
  expect((await service.loadHistory()).messages).toEqual([]);
});
test('malformed snapshots fail before enabling writes', () => {
  expect(() => validateSession({ id: 'a', revision: 1, snapshot: { messages: 'not-an-array' } })).toThrow('已损坏');
  expect(() => validateSession({ id: 'a', revision: 1, snapshot: { messages: [], gameState: {},
    retryBaseMessages: null, retryBaseState: null, viewState: { reading: { messageId: 'm', segmentIndex: -1 } } } })).toThrow('阅读位置');
});
test('archiving appends complete independent snapshots and never modifies the source', async () => {
  const { create, store } = fixture(), a = create(), b = create();
  const original = await a.loadHistory();
  const first = await a.saveHistory(messages, { ...original, asNew: true, gameState: { score: 7 } });
  const second = await b.saveHistory([{ content: 'another tab' }], { ...original, asNew: true });
  expect(first.saveTarget.id).not.toBe(original.saveTarget.id);
  expect(second.saveTarget.id).not.toBe(first.saveTarget.id);
  expect((await a.loadHistory()).gameState).toEqual({ score: 7 });
  await a.setActive(original.saveTarget.id);
  expect((await a.loadHistory()).messages).toEqual([]);
  expect((await a.list()).sessions).toHaveLength(3);
  store.update.mockRejectedValueOnce(new Error('quota'));
  await expect(a.saveHistory(messages, { ...original, asNew: true })).rejects.toThrow('quota');
  expect((await a.list()).sessions).toHaveLength(3);
  await a.delete(original.saveTarget.id);
  await expect(b.saveHistory(messages, { ...original, asNew: true })).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });
});
