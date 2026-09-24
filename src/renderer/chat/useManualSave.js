import React from 'react';
import { savePolicy } from '../platform/index.js';

export default function useManualSave({ snapshot, loadedRef, repository, isLoading, enabled = true }) {
  const state = React.useRef({ baseline: '', target: null, saving: false, error: null,
    savedAt: null, conflict: false, operations: 0 });
  const [, render] = React.useReducer(value => value + 1, 0);
  const loading = React.useRef(isLoading);
  loading.current = isLoading;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const fingerprint = () => JSON.stringify(snapshot());
  const dirty = () => loadedRef.current && state.current.baseline !== fingerprint();
  const busy = () => loading.current || state.current.saving || state.current.operations > 0 || state.current.transition;
  const controller = React.useMemo(() => ({
    hydrate(result) {
      if (savePolicy !== 'manual') return;
      Object.assign(state.current, { baseline: JSON.stringify({ messages: result.messages || [], options: {
        gameState: result.gameState || {}, retryBaseMessages: result.retryBaseMessages ?? null,
        retryBaseState: result.retryBaseState ?? null, viewState: result.viewState || {}
      } }), target: result.saveTarget, savedAt: result.savedAt, conflict: false, error: null });
      render();
    },
    changed: () => { if (savePolicy === 'manual') render(); },
    canMutate: () => savePolicy !== 'manual' || (loadedRef.current && !state.current.saving
      && !state.current.conflict && !state.current.transition),
    endLeave() { state.current.transition = false; render(); },
    beginOperation() {
      if (savePolicy !== 'manual') return undefined;
      state.current.operations += 1; render();
      let ended = false;
      return () => { if (!ended) { ended = true; state.current.operations -= 1; render(); } };
    },
    get blocked() { return !enabledRef.current || (savePolicy === 'manual' && (!loadedRef.current || busy() || state.current.conflict)); },
    get dirty() { return dirty(); },
    get saving() { return state.current.saving; },
    get error() { return state.current.error; },
    get savedAt() { return state.current.savedAt; },
    get conflict() { return state.current.conflict; },
    async save() {
      if (controller.blocked) throw new Error('会话尚未稳定或存在冲突，不能保存');
      const data = JSON.parse(fingerprint());
      const baseline = JSON.stringify(data);
      const target = { ...state.current.target };
      state.current.saving = true; state.current.error = null; render();
      try {
        const result = await repository.saveHistory(data.messages, { ...data.options, saveTarget: target, asNew: true });
        Object.assign(state.current, { baseline, target: result.saveTarget, savedAt: result.savedAt });
        return true;
      } catch (error) {
        state.current.error = error;
        state.current.conflict = error.code === 'SESSION_CONFLICT';
        throw error;
      } finally { state.current.saving = false; render(); }
    },
    async requestLeave() {
      if (busy()) return false;
      state.current.transition = true; render(); return true;
    }
  }), [loadedRef, repository, snapshot]);
  React.useEffect(() => {
    if (savePolicy !== 'manual') return undefined;
    const warn = event => { if (controller.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [controller]);
  return controller;
}
