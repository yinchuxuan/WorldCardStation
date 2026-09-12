/** @returns {import('./contracts.js').RendererServices} */
function createMemoryRendererServices(initial = {}) {
  let config = initial.config || {};
  let background = initial.background || {};
  let history = initial.history || { messages: [] };
  let sessions = initial.sessions || [];
  let activeId = initial.activeId || null;
  let cards = initial.cards || [];
  let activeCardId = initial.activeCardId || null;
  let fullscreen = initial.fullscreen === true;
  const listeners = new Set();
  const closeListeners = new Set();
  const imports = new Map();
  return {
    development: {
      getInstructions: async () => initial.developmentInstructions || '游戏卡开发指令（内存测试平台）'
    },
    config: {
      load: async () => config,
      save: async value => { config = value; return config; }
    },
    background: {
      load: async () => background,
      save: async value => { background = value; listeners.forEach(fn => fn(value)); return background; },
      selectImage: async () => initial.selectedImage || '',
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }
    },
    sessions: {
      loadHistory: async () => history,
      saveHistory: async (messages, options = {}) => { history = { messages, ...options }; return history; },
      list: async () => ({ sessions, activeId }),
      getActive: async () => sessions.find(item => item.id === activeId) || null,
      create: async title => { const item = { id: `session-${sessions.length + 1}`, title }; sessions = [...sessions, item]; activeId = item.id; return item; },
      setActive: async id => { activeId = id; return { id }; },
      rename: async (id, title) => { sessions = sessions.map(item => item.id === id ? { ...item, title } : item); return { id, title }; },
      delete: async id => { sessions = sessions.filter(item => item.id !== id); if (activeId === id) activeId = sessions[0]?.id || null; return { id: activeId }; }
    },
    cards: {
      list: async () => cards,
      setActive: async id => { activeCardId = id || null; return { id: activeCardId }; },
      uninstall: async id => {
        cards = cards.filter(card => card.id !== id);
        if (activeCardId === id) activeCardId = null;
        return { id };
      },
      importFile: async ({ tavernOnly = false } = {}) => {
        if (initial.tavernTask) {
          imports.set(initial.tavernTask.token, { task: initial.tavernTask });
          return initial.tavernTask;
        }
        const card = initial.importedCard || null;
        if (card && tavernOnly) throw new Error('更新酒馆卡请选择 V2/V3 酒馆源文件；原生游戏卡请使用导入卡片');
        if (card && !cards.some(item => item.id === card.id)) cards = [...cards, card];
        activeCardId = card?.id || activeCardId;
        return card;
      },
      stageTavernImport: async (token, plan) => {
        const task = imports.get(token);
        if (!task) throw new Error('导入任务不存在');
        task.card = JSON.parse(plan.files['card.json']);
        task.revision = `${token}-${(task.count = (task.count || 0) + 1)}`;
        return { card: task.card, revision: task.revision };
      },
      commitTavernImport: async (token, revision) => {
        const task = imports.get(token);
        if (!task || task.revision !== revision) throw new Error('转换预览已失效');
        imports.delete(token);
        cards = [...cards.filter(card => card.id !== task.card.id), task.card];
        activeCardId = task.card.id;
        return task.card;
      },
      cancelTavernImport: async token => { imports.delete(token); }
    },
    window: {
      destroy: async () => {},
      isFullscreen: async () => fullscreen,
      onCloseRequested: listener => {
        closeListeners.add(listener);
        return () => closeListeners.delete(listener);
      },
      setFullscreen: async value => { fullscreen = value; }
    }
  };
}

export { createMemoryRendererServices };
