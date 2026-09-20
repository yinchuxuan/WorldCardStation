import { createReference } from './cache/releaseIdentity.js';
import { createReleaseRecords } from './cache/releaseRecords.js';
import { prepareRelease } from './cache/prepareRelease.js';

export function createHostedCards(options = {}) {
  const pending = new Set();
  let active = null, generation = 0;
  const source = () => options.source || new URL('cards/', document.baseURI).href;
  function requireActive() {
    if (!active) throw new Error('游戏资源尚未就绪，请先下载并检查缓存');
    return active;
  }
  async function prepare(entry, config) {
    if (pending.size) throw new Error('已有游戏资源正在准备中');
    const revision = ++generation;
    const reference = await createReference(entry, source());
    if (revision !== generation) throw new Error('资源准备结果已过期，请重试');
    if (pending.size) throw new Error('已有游戏资源正在准备中');
    pending.add(reference.key);
    try {
      if (!globalThis.isSecureContext && !options.caches) throw new Error('资源缓存需要 HTTPS 或 localhost');
      const dependencies = { caches: globalThis.caches, records: createReleaseRecords(),
        fetch: (...args) => globalThis.fetch(...args), estimate: () => navigator.storage?.estimate?.(), ...options };
      if (!dependencies.caches) throw new Error('当前浏览器不支持 Cache Storage');
      const context = await prepareRelease(reference, dependencies, config);
      if (revision !== generation) { context.dispose(); throw new Error('资源准备结果已过期，请重试'); }
      active?.dispose(); active = context;
      return { card: context.card, reference, preloaded: context.preloaded };
    } finally { pending.delete(reference.key); }
  }
  return {
    prepare,
    release() { generation += 1; active?.dispose(); active = null; },
    resources: {
      readText: (...args) => requireActive().resources.readText(...args),
      getImageUrl: (...args) => requireActive().resources.getImageUrl(...args),
      getAudioUrl: (...args) => requireActive().resources.getAudioUrl(...args)
    },
    repository: { getActiveCard: async () => active?.card || null }
  };
}

export const hostedCards = createHostedCards();
