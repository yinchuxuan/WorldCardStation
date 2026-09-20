import { createWebStore } from './storage.js';
import { validateSession } from './sessionSnapshot.js';

const copy = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ messages: [], gameState: {}, viewState: {}, retryBaseMessages: null, retryBaseState: null });
function conflict(message) {
  return Object.assign(new Error(message), { code: 'SESSION_CONFLICT' });
}
function newSession(title) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now,
    revision: 0, messageCount: 0, preview: '', snapshot: empty() };
}

// One scope record keeps snapshots and their index in the same IndexedDB transaction.
export function createWebSessions({ scope, store = createWebStore('sessions'), selection = globalThis.sessionStorage, onEmpty }) {
  const selected = new Map();
  let loaded = null;
  const keyFor = value => value?.key || 'no-card';
  async function context() {
    const reference = await scope();
    return { key: keyFor(reference), reference };
  }
  function choose(key, id) {
    selected.set(key, id);
    selection?.setItem(`wcs-session:${key}`, id || '');
  }
  function active(record) {
    const id = selected.get(record.key) ?? selection?.getItem(`wcs-session:${record.key}`);
    return record.sessions.find(session => session.id === id) || record.sessions[0] || null;
  }
  async function read() {
    const ctx = await context();
    let record = await store.get(ctx.key);
    if (!record) record = await store.update(ctx.key, current => current || {
      ...ctx, sessions: [newSession('默认会话')]
    });
    return record;
  }
  return {
    async loadHistory() {
      loaded = null;
      const record = await read(), session = active(record);
      if (!session) return { ...empty(), sessionMissing: true };
      validateSession(session);
      choose(record.key, session.id);
      loaded = { scope: record.key, id: session.id, revision: session.revision };
      return { ...copy(session.snapshot), saveTarget: { ...loaded }, savedAt: session.revision ? session.updatedAt : null };
    },
    async saveHistory(messages, options = {}) {
      const target = options.saveTarget;
      if (!target) throw new Error('保存缺少已加载的会话目标');
      const snapshot = copy({ messages, gameState: options.gameState || {}, viewState: options.viewState || {},
        retryBaseMessages: options.retryBaseMessages ?? null, retryBaseState: options.retryBaseState ?? null });
      const archive = options.asNew ? newSession('会话存档') : null;
      const record = await store.update(target.scope, current => {
        const session = current?.sessions.find(item => item.id === target.id);
        if (!session) throw conflict('会话已被删除，不能保存；请重新加载');
        if (session.revision !== target.revision) throw conflict('其他页面已修改此会话，请重新加载后继续');
        const updated = { ...(archive || session), snapshot, revision: archive ? 1 : session.revision + 1,
          updatedAt: new Date().toISOString(), messageCount: messages.length,
          preview: String(messages.at(-1)?.content || '').slice(0, 120) };
        return { ...current, sessions: archive ? [...current.sessions, updated]
          : current.sessions.map(item => item.id === target.id ? updated : item) };
      });
      const session = record.sessions.find(item => item.id === (archive?.id || target.id));
      if (archive) choose(target.scope, archive.id);
      if (loaded?.scope === target.scope && loaded?.id === target.id) loaded.revision = session.revision;
      return { saveTarget: { ...target, id: session.id, revision: session.revision }, savedAt: session.updatedAt };
    },
    async list() {
      const record = await read();
      return { activeId: active(record)?.id || null,
        sessions: record.sessions.map(({ snapshot: _snapshot, ...metadata }) => metadata) };
    },
    async getActive() { return { id: active(await read())?.id || null }; },
    async create(title = '新会话') {
      const ctx = await context(), session = newSession(title);
      await store.update(ctx.key, current => ({ ...(current || ctx), sessions: [...(current?.sessions || []), session] }));
      choose(ctx.key, session.id);
      return { id: session.id };
    },
    async setActive(id) {
      const record = await read();
      if (!record.sessions.some(item => item.id === id)) throw new Error('会话不存在');
      choose(record.key, id);
      return { id };
    },
    async rename(id, title) {
      if (!title?.trim()) throw new Error('会话名不能为空');
      const ctx = await context();
      await store.update(ctx.key, current => {
        if (!current?.sessions.some(item => item.id === id)) throw new Error('会话不存在');
        return { ...current, sessions: current.sessions.map(item => item.id === id
          ? { ...item, title: title.trim() } : item) };
      });
    },
    async delete(id) {
      const ctx = await context();
      const record = await store.update(ctx.key, current => {
        if (!current) throw new Error('会话不存在');
        return { ...current, sessions: current.sessions.filter(item => item.id !== id) };
      });
      const next = active(record)?.id || null;
      choose(ctx.key, next);
      if (!next && ctx.reference) await onEmpty?.(ctx.reference);
      return { id: next };
    }
  };
}
