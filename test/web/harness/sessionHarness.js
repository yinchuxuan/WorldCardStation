import { createWebStore } from '../../../src/web/storage.js';
import { createWebSessions } from '../../../src/web/sessions.js';

async function transactions() {
  const name = `wcs-session-test-${crypto.randomUUID()}`;
  const store = createWebStore('sessions', indexedDB, name);
  let scope = { key: 'source-a/card/release-1' };
  const service = () => createWebSessions({ scope: async () => scope, store, selection: null });
  const a = service(), b = service();
  const first = await a.loadHistory(), stale = await b.loadHistory();
  const options = { saveTarget: first.saveTarget, gameState: { score: 7 },
    viewState: { reading: { messageId: 'm', segmentIndex: 2 } },
    retryBaseMessages: [{ role: 'user', content: 'before' }], retryBaseState: { score: 1 } };
  const saved = await a.saveHistory([{ id: 'm', role: 'assistant', content: 'after' }], options);
  let conflict, aborted, deleted;
  try { await b.saveHistory([], { saveTarget: stale.saveTarget }); } catch (error) { conflict = error.code; }
  const snapshot = await b.loadHistory();
  try { await store.update(scope.key, current => ({ ...current, sessions: [], invalid: () => {} })); }
  catch { aborted = true; }
  const afterAbort = await b.loadHistory();
  const isolated = [];
  for (const key of ['source-b/card/release-1', 'source-a/card/release-2', null]) {
    scope = key ? { key } : null;
    isolated.push((await service().loadHistory()).messages.length);
  }
  // A queued save retains the original target, even after this tab changes scope.
  await a.saveHistory([{ content: 'bound target' }], { saveTarget: saved.saveTarget });
  const ordinary = await service().loadHistory();
  scope = { key: 'source-a/card/release-1' };
  const latest = await b.loadHistory();
  await b.delete(latest.saveTarget.id);
  try { await a.saveHistory([], { saveTarget: latest.saveTarget }); } catch (error) { deleted = error.code; }
  const remaining = await b.list();
  indexedDB.deleteDatabase(name);
  return { conflict, aborted, snapshot, afterAbort, isolated, ordinary, deleted, remaining };
}
async function archives() {
  const name = `wcs-archive-test-${crypto.randomUUID()}`;
  const store = createWebStore('sessions', indexedDB, name);
  const a = createWebSessions({ scope: async () => null, store, selection: null });
  const b = createWebSessions({ scope: async () => null, store, selection: null });
  const source = await a.loadHistory();
  const options = { ...source, asNew: true };
  await Promise.all([a.saveHistory([{ content: 'first' }], options), b.saveHistory([{ content: 'second' }], options)]);
  const first = await a.loadHistory(), second = await b.loadHistory();
  await a.setActive(source.saveTarget.id);
  const original = await a.loadHistory();
  const count = (await a.list()).sessions.length;
  indexedDB.deleteDatabase(name);
  return { first, second, original, count };
}
window.sessionHarness = { transactions, archives };
