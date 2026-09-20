import { createReference, referenceEntry } from './releaseIdentity.js';

export function matchesRelease(reference, target) {
  if (!reference || !target) return false;
  return reference?.sourceUrl === target.sourceUrl && reference?.cardId === target.cardId
    && (!target.releaseId || reference.releaseId === target.releaseId);
}

// Every version of one card shares a lock, including partial downloads and all-version removal.
export function createResourceLifecycle({ records, caches, locks = globalThis.navigator?.locks,
  channelFactory = () => new BroadcastChannel('wcs-resource-lifecycle'), invalidate }) {
  let channel;
  const connect = () => {
    if (channel) return;
    channel = channelFactory();
    channel.onmessage = event => { if (event.data?.type === 'unload') invalidate(event.data.target); };
  };
  const controlKey = reference => `unload:${JSON.stringify([reference.sourceUrl, reference.cardId])}`;
  const epoch = async reference => (await records.get(controlKey(reference)))?.epoch || 0;
  const lock = (reference, operation, signal) => {
    if (!locks?.request) throw new Error('当前浏览器不支持安全的跨页面资源管理（Web Locks）');
    return signal ? locks.request(controlKey(reference), { signal }, operation) : locks.request(controlKey(reference), operation);
  };
  function announce(target) {
    invalidate(target);
    channel.postMessage({ type: 'unload', target });
  }
  return {
    async prepare(reference, operation, signal) {
      connect();
      const started = await epoch(reference);
      return lock(reference, async () => {
        if (started !== await epoch(reference)) throw new Error('资源已卸载，请重新选择游戏');
        return operation();
      }, signal);
    },
    async uninstall(reference, { allVersions = false } = {}) {
      connect();
      const target = { sourceUrl: reference.sourceUrl, cardId: reference.cardId,
        releaseId: allVersions ? null : reference.releaseId };
      announce(target);
      return lock(reference, async () => {
        await records.put({ key: controlKey(reference), epoch: await epoch(reference) + 1 });
        announce(target);
        const registered = (await records.list()).filter(record => matchesRelease(record, target));
        const targets = new Map([[reference.key, reference], ...registered.map(record => [record.key, record])]);
        // Reconstruct cache names from validated identities; never trust persisted arbitrary cache names.
        const releases = await Promise.all([...targets.values()].map(record => createReference(referenceEntry(record), reference.sourceUrl)));
        for (const release of releases) {
          const previous = await records.get(release.key);
          await records.put({ ...previous, ...release, ready: false });
          await caches.delete(release.cacheName);
        }
        if (allVersions) {
          const prefix = `wcs-card-v1-${reference.sourceId}-${reference.cardId}-`;
          for (const name of await caches.keys()) {
            if (name.startsWith(prefix) && /^sha256-[a-f0-9]{64}$/.test(name.slice(prefix.length))) await caches.delete(name);
          }
        }
        return { removed: releases.map(release => release.key) };
      });
    },
    close() { channel?.close(); channel = null; }
  };
}
