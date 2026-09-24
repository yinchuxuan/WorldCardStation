import React from 'react';
import { PropTypes } from '../components/componentPropTypes.js';
import { normalizeGameCardError } from '../gameCard/runtimeError.js';
import { gameCardPlatform } from '../platform/index.js';
import { invalidateGameCardRuntimeCache } from '../gameCard/gameCardRuntimeCache.js';

const GameCardRuntimeContext = React.createContext(null);

function GameCardRuntimeProvider({ children, platform = gameCardPlatform, mainSession }) {
  const [activeCard, setActiveCard] = React.useState(null);
  const [gameState, setGameState] = React.useState({});
  const [runtimeError, setRuntimeError] = React.useState(null);

  const reloadActiveCard = React.useCallback(async () => {
    invalidateGameCardRuntimeCache();
    try {
      const card = await platform.repository.getActiveCard();
      setActiveCard(card || null);
      return card || null;
    } catch (error) {
      setRuntimeError(normalizeGameCardError(error));
      return null;
    }
  }, [platform]);

  React.useEffect(() => { reloadActiveCard(); }, [reloadActiveCard]);

  const changeActiveCard = React.useCallback((card) => {
    invalidateGameCardRuntimeCache();
    setRuntimeError(null);
    setActiveCard(card || null);
  }, []);

  const value = React.useMemo(() => ({
    mainSession,
    activeCard,
    changeActiveCard,
    gameState,
    reloadActiveCard,
    runtimeError,
    setGameState,
    setRuntimeError
  }), [activeCard, changeActiveCard, gameState, reloadActiveCard, runtimeError, mainSession]);

  return <GameCardRuntimeContext.Provider value={value}>{children}</GameCardRuntimeContext.Provider>;
}

GameCardRuntimeProvider.propTypes = {
  mainSession: PropTypes.object,
  children: PropTypes.node,
  platform: PropTypes.shape({
    repository: PropTypes.shape({ getActiveCard: PropTypes.func.isRequired }).isRequired
  })
};

function useGameCardRuntime() {
  const runtime = React.useContext(GameCardRuntimeContext);
  if (!runtime) throw new Error('useGameCardRuntime must be used inside GameCardRuntimeProvider');
  return runtime;
}

export { GameCardRuntimeProvider, useGameCardRuntime };
