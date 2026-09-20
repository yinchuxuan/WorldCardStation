import { createHostedCards } from '../../../src/web/hostedCards.js';
import { createReference } from '../../../src/web/cache/releaseIdentity.js';
import { createReleaseRecords } from '../../../src/web/cache/releaseRecords.js';
import { createWebStore } from '../../../src/web/storage.js';
import { createWebSessions } from '../../../src/web/sessions.js';

const source = new URL('/cards/', location.href).href;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const records = createReleaseRecords();
async function isolation() {
  const entries = await (await fetch('/__versions')).json();
  const a = createHostedCards({ source }), b = createHostedCards({ source });
  const other = createHostedCards({ source: new URL('/play/cards/', location.href).href });
  const first = await a.prepare(entries[0]), second = await b.prepare(entries[1]);
  const foreign = await other.prepare(entries[0]);
  const sessions = createWebSessions({ scope: async () => first.reference, selection: null });
  const original = await sessions.loadHistory();
  await sessions.saveHistory([{ content: 'kept' }], { ...original, asNew: true, gameState: { score: 9 } });
  const before = JSON.stringify(await createWebStore('sessions').list());
  const url = await a.resources.getImageUrl(first.card.id, 'images/cover.png');
  await a.uninstall(entries[0]);
  assert(!(await caches.keys()).includes(first.reference.cacheName), 'selected cache removed');
  assert((await caches.keys()).includes(second.reference.cacheName), 'other version retained');
  assert((await caches.keys()).includes(foreign.reference.cacheName), 'other source retained');
  assert(JSON.stringify(await createWebStore('sessions').list()) === before, 'unload never changes sessions');
  assert(!(await records.get(first.reference.key)).ready, 'reference retained with readiness cleared');
  assert(!await a.repository.getActiveCard(), 'active runtime released');
  let revoked = false;
  try { await fetch(url); } catch { revoked = true; }
  assert(revoked, 'media URL revoked');
  await a.prepare(entries[0]);
  assert((await sessions.loadHistory()).gameState.score === 9, 'saved state survives re-download');
  const keys = await caches.keys();
  const saved = await sessions.loadHistory();
  await sessions.delete(saved.saveTarget.id);
  assert(JSON.stringify(await caches.keys()) === JSON.stringify(keys), 'session deletion never touches caches');
  assert((await sessions.list()).sessions.length === 1, 'other session preserved');
  let conflict;
  try { await sessions.saveHistory([], { ...saved, asNew: true }); } catch (error) { conflict = error.code; }
  assert(conflict === 'SESSION_CONFLICT', 'deleted source cannot be resurrected');
  await a.uninstall(entries[0], { allVersions: true });
  assert(!(await caches.keys()).includes(second.reference.cacheName), 'all versions removed');
  assert((await caches.keys()).includes(foreign.reference.cacheName), 'foreign source still retained');
  a.dispose(); b.dispose(); other.dispose();
  return 'isolated';
}
async function races() {
  const [entry] = await (await fetch('/__versions')).json();
  const reference = await createReference(entry, source);
  await caches.delete(reference.cacheName);
  let unblock, reached;
  const barrier = new Promise(resolve => { unblock = resolve; });
  const writing = new Promise(resolve => { reached = resolve; });
  const writer = createHostedCards({ source, caches: { open: async name => {
    const cache = await caches.open(name);
    return { match: cache.match.bind(cache), delete: cache.delete.bind(cache), put: async (...args) => {
      reached(); await barrier; return cache.put(...args);
    } };
  } } });
  const remover = createHostedCards({ source });
  const download = writer.prepare(entry).catch(error => error);
  await writing;
  const queued = createHostedCards({ source }), controller = new AbortController();
  const cancellation = queued.prepare(entry, { signal: controller.signal }).catch(error => error);
  while (!(await navigator.locks.query()).pending.length) await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort();
  assert((await cancellation).name === 'AbortError', 'queued download cancels without waiting for another tab');
  let removed = false;
  const removal = remover.uninstall(entry).then(() => { removed = true; });
  // Wait until the remover really queues behind the writing tab's lock.
  while (!(await navigator.locks.query()).pending.length) await new Promise(resolve => setTimeout(resolve, 5));
  assert(!removed, 'uninstall waits for in-flight cache writes');
  unblock(); await download; await removal;
  assert(!(await caches.keys()).includes(reference.cacheName), 'late writer cannot restore deleted cache');
  assert(!(await records.get(reference.key)).ready, 'late writer cannot restore ready marker');
  const retry = createHostedCards({ source });
  await retry.prepare(entry);
  const failure = createHostedCards({ source, caches: { delete: async () => { throw new Error('injected delete failure'); } } });
  let message;
  try { await failure.uninstall(entry); } catch (error) { message = error.message; }
  assert(message === 'injected delete failure', 'deletion failure reported');
  assert(!(await records.get(reference.key)).ready, 'partial failure is not marked ready');
  await remover.uninstall(entry);
  assert(!(await caches.keys()).includes(reference.cacheName), 'cleanup can retry');
  writer.dispose(); remover.dispose(); retry.dispose(); failure.dispose(); queued.dispose();
  return 'race-safe';
}
window.resourceLifecycleHarness = { isolation, races };
