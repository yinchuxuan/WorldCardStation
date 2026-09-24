import React from 'react';
import { getStateValue } from '../../shared/game-card/state/statePaths.js';

const EMPTY_VIEW = { state: {}, contexts: {}, records: [], reading: null };
const KEYS = ['visual.scene', 'visual.portraits', 'visual.textPanel', 'audio.bgm'];

function useMainPresentation({ mainSession, card, presentation, setGameState }) {
  const options = React.useRef();
  options.current = { card, presentation, setGameState };
  const [current, setCurrent] = React.useState({ session: mainSession, view: mainSession?.view() || EMPTY_VIEW });
  React.useEffect(() => {
    if (!mainSession) return undefined;
    let previous = mainSession.view().state, first = true, baseline;
    const sync = (view, detail) => {
      const { card: activeCard, presentation: stage, setGameState: setState } = options.current;
      setCurrent({ session: mainSession, view });
      setState(view.state);
      if (detail.type === 'start') {
        if (!detail.retry) baseline = stage.capture();
        else if (baseline) stage.restore(baseline);
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
    };
    sync(mainSession.view(), { type: 'bind' });
    return mainSession.subscribe(sync);
  }, [mainSession]);
  return current.session === mainSession ? current.view : mainSession?.view() || EMPTY_VIEW;
}

export default useMainPresentation;
