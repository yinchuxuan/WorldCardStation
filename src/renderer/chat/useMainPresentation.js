import React from 'react';
import { getStateValue } from '../../shared/game-card/state/statePaths.js';
import useMainView from './useMainView.js';

const KEYS = ['visual.scene', 'visual.portraits', 'visual.textPanel', 'audio.bgm'];

function useMainPresentation({ mainSession, card, presentation, setGameState, setMessages, setIsLoading }) {
  const current = useMainView({ mainSession, setGameState, setMessages, setIsLoading });
  const options = React.useRef();
  options.current = { card, presentation };
  React.useEffect(() => {
    if (!mainSession) return undefined;
    let previous = mainSession.view().state, first = true, baseline;
    const sync = (view, detail) => {
      const { card: activeCard, presentation: stage } = options.current;
      const restoredTargets = saved => Object.fromEntries(Object.entries(saved || {})
        .map(([key, state]) => [key, state ? { card: activeCard, state } : null]));
      if (detail.type === 'restore' || detail.type === 'bind') {
        const saved = mainSession.viewState?.presentation;
        if (saved) stage.restore(restoredTargets(saved));
        else stage.updateAll(activeCard, view.state);
        baseline = undefined;
      } else if (detail.type === 'loading') { stage.restore({}); baseline = undefined; }
      else if (detail.type === 'start') {
        if (!detail.retry) baseline = stage.capture();
        else { baseline = restoredTargets(mainSession.viewState?.presentation); stage.restore(baseline); }
        first = true; stage.stopBgm();
      }
      else if (detail.type === 'rollback') { if (baseline) stage.restore(baseline); }
      else {
        const changed = KEYS.filter(key => JSON.stringify(getStateValue(previous, key)) !== JSON.stringify(getStateValue(view.state, key)));
        // An explicit reading-time BGM set restarts even the same track.
        if (detail.type === 'reading-patch' && detail.updates.some(item => item.operation === 'state.set'
          && (item.path === 'audio.bgm' || item.path === 'audio'))) changed.push('audio.bgm');
        if (changed.includes('visual.textPanel')) changed.push('visual.scene');
        stage.updateChanged(activeCard, view.state, changed);
        if (detail.effects?.length) stage.applyEffects(detail.effects, { card: activeCard, state: view.state });
        if (detail.type === 'display' && first) {
          first = false;
          if (activeCard?.presentation?.autoUpdateOnFirstToken !== false) {
            stage.updateBackground(activeCard, view.state);
            stage.updatePortrait(activeCard, view.state);
            if (detail.mode === 'continuous') stage.updateBgm(activeCard, view.state);
          }
        }
      }
      previous = view.state;
      if (detail.type === 'complete' || detail.type === 'host-state') {
        mainSession.setViewState?.({ reading: null, presentation: Object.fromEntries(
          Object.entries(stage.capture()).map(([key, target]) => [key, target?.state || null])) });
      }
    };
    sync(mainSession.view(), { type: 'bind' });
    return mainSession.subscribe(sync);
  }, [mainSession, card]);
  return current;
}

export default useMainPresentation;
