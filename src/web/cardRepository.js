import { loadCatalog } from './catalog.js';
import { hostedCards } from './hostedCards.js';

export function createHostedRepository(manager = hostedCards, catalog = loadCatalog) {
  let entries = [];
  let restored;
  const selectionKey = () => `wcs-active-card:${new URL('cards/', document.baseURI).href}`;
  const remember = entry => sessionStorage.setItem(selectionKey(), JSON.stringify(entry));
  return {
    restore() {
      if (!restored) restored = (async () => {
        const entry = JSON.parse(sessionStorage.getItem(selectionKey()) || 'null');
        if (entry) await manager.prepare(entry);
      })().catch(error => { restored = null; throw error; });
      return restored;
    },
    async list() {
      entries = await catalog(new URL('cards/', document.baseURI));
      return entries.map(entry => ({ ...entry, id: entry.cardId, version: entry.cardVersion }));
    },
    async setActive(id, options) {
      if (!id) { remember(null); manager.release(); restored = Promise.resolve(); return null; }
      const entry = entries.find(entry => entry.cardId === id);
      if (!entry) throw new Error('请重新打开游戏卡列表，所选卡片不在可信目录中');
      const result = await manager.prepare(entry, options);
      remember(entry); restored = Promise.resolve();
      return result.card;
    }
  };
}
