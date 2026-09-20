import { webcrypto } from 'crypto';
import { createResourceLifecycle, matchesRelease } from '../../../src/web/cache/resourceLifecycle.js';
import { createReference } from '../../../src/web/cache/releaseIdentity.js';

beforeAll(() => { Object.defineProperty(crypto, 'subtle', { value: webcrypto.subtle, configurable: true }); });
async function reference(version = 'a', source = 'https://example.test/cards/') {
  const releaseId = `sha256-${version.repeat(64)}`;
  return createReference({ cardId: 'demo', cardVersion: version, releaseId, name: 'Demo', description: '',
    cover: null, release: `demo/${releaseId}/release.json` }, source);
}
function setup(values) {
  const data = new Map(values.map(value => [value.key, { ...value, ready: true }]));
  const records = { get: jest.fn(async key => data.get(key)), put: jest.fn(async value => data.set(value.key, value)),
    list: async () => [...data.values()] };
  let tail = Promise.resolve();
  const locks = { request: (_key, operation) => { const result = tail.then(operation); tail = result.catch(() => {}); return result; } };
  const caches = { delete: jest.fn(async () => true), keys: async () => [] }, invalidate = jest.fn();
  const channel = { postMessage: jest.fn(), close: jest.fn() };
  const manager = createResourceLifecycle({ records, caches, locks, invalidate, channelFactory: () => channel });
  return { manager, records, caches, channel, invalidate, data, locks };
}
test('version removal preserves references and other versions/sources; all-version removal stays scoped', async () => {
  const a = await reference(), b = await reference('b'), other = await reference('a', 'https://example.test/other/');
  const { manager, records, caches, channel, invalidate } = setup([a, b, other]);
  await manager.uninstall(a);
  expect(caches.delete.mock.calls).toEqual([[a.cacheName]]);
  expect((await records.get(a.key)).ready).toBe(false);
  expect((await records.get(b.key)).ready).toBe(true);
  await manager.uninstall(a, { allVersions: true });
  expect(caches.delete.mock.calls.slice(1)).toEqual([[a.cacheName], [b.cacheName]]);
  expect((await records.get(other.key)).ready).toBe(true);
  channel.onmessage({ data: { type: 'unload', target: a } });
  expect(invalidate).toHaveBeenCalledWith(a);
  manager.close(); expect(channel.close).toHaveBeenCalled();
});
test('partial cleanup is retryable and never leaves a ready marker on a failed cache deletion', async () => {
  const a = await reference(), { manager, caches, records } = setup([a]);
  caches.delete.mockRejectedValueOnce(new Error('cache busy'));
  await expect(manager.uninstall(a)).rejects.toThrow('cache busy');
  expect((await records.get(a.key)).ready).toBe(false);
  await manager.uninstall(a); expect(caches.delete).toHaveBeenCalledTimes(2);
  records.put.mockRejectedValueOnce(new Error('database failed'));
  await expect(manager.uninstall(a)).rejects.toThrow('database failed');
  expect(caches.delete).toHaveBeenCalledTimes(2);
});
test('uninstall waits for writes; queued old preparation cannot recreate removed resources', async () => {
  const a = await reference(), { manager, caches, locks } = setup([await reference()]);
  let unlock;
  const held = locks.request('test', () => new Promise(resolve => { unlock = resolve; }));
  await Promise.resolve();
  const removal = manager.uninstall(a);
  const write = jest.fn();
  const late = manager.prepare(a, write).catch(error => error);
  await Promise.resolve(); await Promise.resolve();
  expect(caches.delete).not.toHaveBeenCalled();
  unlock(); await held; await removal;
  expect((await late).message).toContain('已卸载');
  expect(write).not.toHaveBeenCalled();
  await manager.prepare(a, write); expect(write).toHaveBeenCalledTimes(1);
});
test('matching and unsupported browsers fail safely', async () => {
  const a = await reference();
  expect(matchesRelease(null, a)).toBe(false);
  expect(matchesRelease(a, { ...a, releaseId: 'other' })).toBe(false);
  const channel = { postMessage: jest.fn() };
  const manager = createResourceLifecycle({ records: { get: async () => null }, caches: {}, locks: null,
    invalidate: jest.fn(), channelFactory: () => channel });
  await expect(manager.prepare(a, jest.fn())).rejects.toThrow('Web Locks');
});
