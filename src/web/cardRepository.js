import { loadCatalog } from './catalog.js';
import { hostedCards } from './hostedCards.js';
import { createReference, referenceEntry } from './cache/releaseIdentity.js';

export function createHostedRepository(manager = hostedCards, catalog = loadCatalog) {
  let entries = [];
  let restored;
  const selectionKey = () => `wcs-active-card:${new URL('cards/', document.baseURI).href}`;
  const remember = entry => sessionStorage.setItem(selectionKey(), JSON.stringify(entry));
  manager.subscribe?.(() => { remember(null); restored = Promise.resolve(); });
  return {
    getActiveSelection: () => manager.getReference?.()?.key,
    restore() {
      if (!restored) restored = (async () => {
        const entry = JSON.parse(sessionStorage.getItem(selectionKey()) || 'null');
        if (entry) await manager.prepare(entry);
      })().catch(error => { restored = null; throw error; });
      return restored;
    },
    async list() {
      const source = new URL('cards/', document.baseURI);
      entries = await catalog(source);
      if (manager.listReferences) {
        const current = await Promise.all(entries.map(entry => createReference(entry, source.href)));
        const previous = (await manager.listReferences()).filter(record => record.sourceUrl === source.href
          && record.cardId && !current.some(entry => entry.key === record.key));
        entries = [...current, ...previous].map(record => ({ ...referenceEntry(record), selectionId: record.key }));
      }
      return entries.map(entry => ({ ...entry, id: entry.cardId, version: entry.cardVersion }));
    },
    async setActive(id, options) {
      if (!id) { remember(null); manager.release(); restored = Promise.resolve(); return null; }
      const entry = entries.find(entry => entry.selectionId === id || entry.cardId === id);
      if (!entry) throw new Error('请重新打开游戏卡列表，所选卡片不在可信目录中');
      const result = await manager.prepare(entry, options);
      remember(entry); restored = Promise.resolve();
      return result.card;
    },
    async uninstall(id, options = { allVersions: true }) {
      const entry = entries.find(entry => entry.selectionId === id || entry.cardId === id);
      if (!entry) throw new Error('请重新打开游戏卡列表，确认要卸载的卡片');
      return manager.uninstall(entry, options);
    }
  };
}
