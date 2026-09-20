import React from 'react';
import { applyUiScriptRunEvent } from './uiScripts.js';
import { applyUiStateActionEvent } from './uiStateActions.js';
import { gameCardPlatform } from '../platform/index.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';

const handlers = {
  'game.state.apply': applyUiStateActionEvent,
  'game.script.run': applyUiScriptRunEvent
};

function useUiStateEventQueue({ card, gameState = {}, messages = [], setGameState, onError, beginOperation, canMutate }) {
  const activeRef = React.useRef(true);
  const tailRef = React.useRef(Promise.resolve());
  const stateRef = React.useRef(gameState || {});
  const previousStateRef = React.useRef(gameState);
  const optionsRef = React.useRef(null);

  if (previousStateRef.current !== gameState) {
    previousStateRef.current = gameState;
    stateRef.current = gameState || {};
  }
  optionsRef.current = { card, messages, setGameState, onError, beginOperation, canMutate };

  React.useEffect(() => () => {
    activeRef.current = false;
  }, []);

  return React.useCallback((event) => {
    const handler = handlers[event?.type];
    if (!handler) return false;
    if (optionsRef.current.canMutate?.() === false) return false;
    const end = optionsRef.current.beginOperation?.();
    const traceContext = runtimeTrace.capture();
    const task = tailRef.current.then(async () => {
      if (!activeRef.current) return false;
      const options = optionsRef.current;
      if (typeof options.setGameState !== 'function') return false;
      const operation = traceContext.begin(event.type, { messages: options.messages, state: stateRef.current }, { event });
      try {
        const result = await handler({
          event,
          state: stateRef.current,
          messages: options.messages,
          card: options.card,
          platform: gameCardPlatform,
          observer: operation?.observe
        });
        operation?.observe('ui.result', { result: result.trace }, options.messages,
          activeRef.current ? result.state : stateRef.current);
        operation?.end(undefined, !activeRef.current ? 'discarded' : result.trace?.reason ? 'rejected' : 'committed');
        if (!activeRef.current) return false;
        if (result.trace?.error) throw new Error(result.trace.error);
        if (result.trace?.reason) return false;
        stateRef.current = result.state;
        options.setGameState(result.state);
        return result.applied;
      } catch (error) {
        operation?.observe('ui.error', { error: error.message });
        operation?.end({ messages: options.messages, state: stateRef.current }, 'failed');
        throw error;
      }
    }).finally(() => end?.());

    tailRef.current = task.catch(() => false);
    return task.catch((error) => {
      if (activeRef.current) optionsRef.current.onError?.(error);
      return false;
    });
  }, []);
}

export default useUiStateEventQueue;
