import { loadCatalog } from './catalog.js';
import { hostedCards } from './hostedCards.js';

export function createHostedRepository(manager = hostedCards, catalog = loadCatalog) {
  let entries = [];
  return {
    async list() {
      entries = await catalog(new URL('cards/', document.baseURI));
      return entries.map(entry => ({ ...entry, id: entry.cardId, version: entry.cardVersion }));
    },
    async setActive(id, options) {
      if (!id) { manager.release(); return null; }
      const entry = entries.find(entry => entry.cardId === id);
      if (!entry) throw new Error('请重新打开游戏卡列表，所选卡片不在可信目录中');
      return (await manager.prepare(entry, options)).card;
    }
  };
}
