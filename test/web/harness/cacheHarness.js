import { createHostedCards } from '../../../src/web/hostedCards.js';
import { createReference, fileUrl } from '../../../src/web/cache/releaseIdentity.js';
import { createReleaseRecords } from '../../../src/web/cache/releaseRecords.js';
import { loadCatalog } from '../../../src/web/catalog.js';

const source = new URL('/cards/', location.href).href;
const records = createReleaseRecords();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
let manager, entry, reference, manifest, cache;
async function fault(mode, suffix = '') {
  await fetch('/__fault', { method: 'POST', body: JSON.stringify({ mode, suffix }) });
}
async function requests() { return (await (await fetch('/__requests')).json()).filter(r => r.path.includes('/cards/')); }
async function expectFailure(operation, pattern) {
  try { await operation(); } catch (error) { assert(pattern.test(error.message), error.message); return; }
  throw new Error('Expected operation to fail');
}
async function initialize() {
  await fault('none');
  [entry] = await loadCatalog(new URL(source));
  reference = await createReference(entry, source);
  await caches.delete(reference.cacheName);
  manager = createHostedCards({ source });
  const progress = [];
  const result = await manager.prepare(entry, { onProgress: value => progress.push(value) });
  cache = await caches.open(reference.cacheName);
  manifest = await (await cache.match(reference.releaseUrl)).json();
  assert((await cache.keys()).length === manifest.files.length + (manifest.cover ? 1 : 0) + 1, 'all manifest resources cached');
  assert(progress.at(-1).phase === 'ready', 'must finish ready');
  assert(result.preloaded.fileContents['scripts/helper.js'].includes('initialCount'), 'runtime script preload');
  assert((await records.get(reference.key)).ready, 'ready record committed');
  assert(await cache.match(fileUrl(reference, 'worldbook/序章.md')), 'dynamic scope also downloaded');
  return 'complete';
}
async function offline() {
  await fault('404');
  const before = (await requests()).length;
  await manager.prepare(entry);
  assert((await requests()).length === before, 'warm cache must make zero publishing requests');
  assert((await manager.resources.readText(entry.cardId, 'worldbook/序章.md')).includes('欢迎'), 'cached text');
  const image = await manager.resources.getImageUrl(entry.cardId, 'images/cover.png');
  assert(image.startsWith('blob:'), 'must use blob media');
  assert((await fetch(image)).ok, 'blob is readable offline');
  const audio = await manager.resources.getAudioUrl(entry.cardId, 'audio/tone.wav');
  assert((await fetch(audio)).headers.get('Content-Type') === 'audio/wav', 'cached audio Blob MIME');
  manager.release();
  await expectFailure(() => fetch(image), /fetch|load/i);
  await manager.prepare(entry);
  await fault('none');
  return 'offline-ready';
}
async function repair() {
  const path = 'worldbook/序章.md';
  await cache.delete(fileUrl(reference, path));
  await expectFailure(() => manager.resources.readText(entry.cardId, path), /缺失/);
  const before = (await requests()).length;
  await manager.prepare(entry);
  const downloaded = (await requests()).slice(before);
  assert(downloaded.length === 1 && decodeURIComponent(downloaded[0].path).endsWith(path), 'repair only missing resource');
  return 'repaired-one';
}
async function failures() {
  const path = 'scripts/helper.js';
  const original = await manager.repository.getActiveCard();
  for (const mode of ['404', 'corrupt', 'truncate']) {
    await cache.delete(fileUrl(reference, path)); await fault(mode, path);
    await expectFailure(() => manager.prepare(entry), /404|校验|超过|network|terminated|load|fetch/i);
    assert(!(await records.get(reference.key)).ready, 'failed download must not mark ready');
    assert(!await cache.match(fileUrl(reference, path)), 'bad bytes must not be cached');
    assert(await manager.repository.getActiveCard() === original, 'failure must preserve old context');
  }
  await fault('delay', path);
  const controller = new AbortController();
  const pending = manager.prepare(entry, { signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  await expectFailure(() => pending, /取消|abort/i);
  assert(!(await records.get(reference.key)).ready, 'abort must not mark ready');
  await fault('none'); await manager.prepare(entry);
  return 'failed-safely';
}
async function storageFailure() {
  // Fault injection at write boundaries; storage reads/writes otherwise use real browser APIs.
  const badRecords = { get: records.get, put: record => record.ready ? Promise.reject(new Error('marker write failed')) : records.put(record) };
  const failed = createHostedCards({ source, records: badRecords });
  await expectFailure(() => failed.prepare(entry), /marker write/);
  assert(await failed.repository.getActiveCard() === null, 'marker failure must not activate');
  assert(!(await records.get(reference.key)).ready, 'marker remains false');
  const before = (await requests()).length;
  await manager.prepare(entry);
  assert((await requests()).length === before, 'marker retry reuses complete cache');
  await cache.delete(fileUrl(reference, 'scripts/helper.js'));
  const quota = createHostedCards({ source, caches: { open: async name => {
    const real = await caches.open(name);
    return { match: real.match.bind(real), delete: real.delete.bind(real), put: async () => { throw new DOMException('full', 'QuotaExceededError'); } };
  } } });
  await expectFailure(() => quota.prepare(entry), /空间不足/);
  assert(!await quota.repository.getActiveCard(), 'quota failure must not activate');
  await manager.prepare(entry);
  return 'storage-recovered';
}
async function isolation() {
  const other = createHostedCards({ source: new URL('/play/cards/', location.href).href });
  const result = await other.prepare(entry);
  assert(result.reference.cacheName !== reference.cacheName, 'source cache namespaces differ');
  await caches.delete(result.reference.cacheName);
  assert(await cache.match(fileUrl(reference, 'card.json')), 'other source unaffected');
  await expectFailure(() => manager.resources.readText('other-card', 'card.json'), /不属于/);
  await expectFailure(() => manager.resources.readText(entry.cardId, '../card.json'), /类型|授权|安全/);
  await expectFailure(() => manager.resources.getImageUrl(entry.cardId, 'scripts/main.js'), /类型/);
  other.release();
  const versions = await (await fetch('/__versions')).json();
  const next = createHostedCards({ source });
  const nextResult = await next.prepare(versions[1]);
  assert(nextResult.reference.cacheName !== reference.cacheName, 'versions have separate caches');
  assert(nextResult.card.version === '2.0', 'second release loads its own card');
  assert((await manager.repository.getActiveCard()).version === '1.0', 'old active card stays pinned');
  await caches.delete(nextResult.reference.cacheName);
  assert(await cache.match(fileUrl(reference, 'card.json')), 'removing new release does not touch old');
  next.release();
  return 'isolated';
}
window.cacheHarness = { initialize, offline, repair, failures, storageFailure, isolation };
