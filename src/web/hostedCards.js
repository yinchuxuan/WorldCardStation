import { createReference } from './cache/releaseIdentity.js';
import { createReleaseRecords } from './cache/releaseRecords.js';
import { prepareRelease } from './cache/prepareRelease.js';
import { createResourceLifecycle, matchesRelease } from './cache/resourceLifecycle.js';

export function createHostedCards(options = {}) {
  const listeners = new Set();
  const errors = new Set();
  let preparing = null;
  let active = null, generation = 0, activeReference = null;
  const source = () => options.source || new URL('cards/', document.baseURI).href;
  const dependencies = { caches: globalThis.caches, records: createReleaseRecords(),
    fetch: (...args) => globalThis.fetch(...args), estimate: () => navigator.storage?.estimate?.(), ...options };
  function release() { generation += 1; preparing?.controller.abort(); active?.dispose(); active = null; activeReference = null; }
  const lifecycle = options.lifecycle || createResourceLifecycle({ ...dependencies, invalidate(target) {
    const affected = matchesRelease(activeReference, target);
    const pendingAffected = matchesRelease(preparing?.reference, target) && !preparing.controller.signal.aborted;
    if (pendingAffected) { generation += 1; preparing.controller.abort(); }
    if (affected || (pendingAffected && !activeReference)) {
      release(); listeners.forEach(listener => listener(target));
    }
  } });
  function requireActive() {
    if (!active) throw new Error('游戏资源尚未就绪，请先下载并检查缓存');
    return active;
  }
  async function prepare(entry, config) {
    if (preparing) throw new Error('已有游戏资源正在准备中');
    const revision = ++generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    config?.signal?.addEventListener('abort', abort, { once: true });
    if (config?.signal?.aborted) abort();
    preparing = { reference: { sourceUrl: source(), cardId: entry.cardId, releaseId: entry.releaseId }, controller };
    try {
      if (!globalThis.isSecureContext && !options.caches) throw new Error('资源缓存需要 HTTPS 或 localhost');
      if (!dependencies.caches) throw new Error('当前浏览器不支持 Cache Storage');
      return await lifecycle.prepare(preparing.reference, async () => {
        const reference = await createReference(entry, source());
        preparing.reference = reference;
        if (controller.signal.aborted || revision !== generation) throw new Error('资源准备结果已过期，请重试');
        const context = await prepareRelease(reference, dependencies, { ...config, signal: controller.signal });
        if (revision !== generation) { context.dispose(); throw new Error('资源准备结果已过期，请重试'); }
        active?.dispose(); active = context; activeReference = reference;
        return { card: context.card, reference, preloaded: context.preloaded };
      }, controller.signal);
    } finally { preparing = null; config?.signal?.removeEventListener('abort', abort); }
  }
  return {
    prepare,
    listReferences: () => dependencies.records.list(),
    async uninstall(entry, config) {
      try { return await lifecycle.uninstall(await createReference(entry, source()), config); }
      catch (error) { errors.forEach(listener => listener(error)); throw error; }
    },
    subscribeErrors(listener) { errors.add(listener); return () => errors.delete(listener); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    exit() { release(); listeners.forEach(listener => listener()); },
    dispose() { release(); lifecycle.close?.(); listeners.clear(); errors.clear(); },
    getReference: () => activeReference,
    release,
    resources: {
      readText: (...args) => requireActive().resources.readText(...args),
      getImageUrl: (...args) => requireActive().resources.getImageUrl(...args),
      getAudioUrl: (...args) => requireActive().resources.getAudioUrl(...args)
    },
    repository: { getActiveCard: async () => active?.card || null }
  };
}

export const hostedCards = createHostedCards();
