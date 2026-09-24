import { cloneJson, deepFreeze } from '../../shared/game-card/utils/jsonValue.js';

// Host-only UI bridge. Reading acknowledgements never execute card code on the renderer.
function createMainSessionView(initial) {
  let view = deepFreeze({ ...cloneJson(initial), reading: null, pendingInput: null });
  let advance;
  const listeners = new Set();
  const update = (snapshot, detail = {}) => {
    view = deepFreeze({ ...cloneJson(snapshot), reading: view.reading, pendingInput: view.pendingInput });
    listeners.forEach(listener => listener(view, detail));
  };
  const reset = (snapshot, type, extra = {}) => {
    view = { ...view, reading: null, pendingInput: type === 'start' && !extra.startup ? extra.input ?? null : null }; advance = undefined;
    update(snapshot, { type, ...extra });
  };
  async function display({ view: snapshot, mode, recordId, waitForAdvance = true }, signal) {
    if (signal.aborted) throw new Error('reading cancelled');
    if (snapshot.records?.some(record => record.id === recordId && record.content?.trim())) {
      view = { ...view, pendingInput: null };
    }
    if (mode === 'continuous' || !waitForAdvance) { update(snapshot, { type: 'display', mode }); return; }
    await new Promise((resolve, reject) => {
      const cleanup = () => { signal.removeEventListener('abort', abort); advance = undefined; view = deepFreeze({ ...view, reading: null }); };
      const abort = () => { cleanup(); reject(new Error('reading cancelled')); };
      signal.addEventListener('abort', abort, { once: true });
      advance = () => { cleanup(); update(view, { type: 'read-advance' }); resolve(); };
      view = { ...view, reading: { recordId } };
      try { update(snapshot, { type: 'display', mode }); } catch (error) { cleanup(); reject(error); }
    });
  }
  return { update, reset, display, get: () => view,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    next() { if (!advance) return false; advance(); return true; }
  };
}

export { createMainSessionView };
