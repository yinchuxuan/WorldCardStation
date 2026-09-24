import React from 'react';
import { PropTypes } from '../components/componentPropTypes.js';
import { normalizeGameCardError } from '../gameCard/runtimeError.js';
import { gameCardPlatform, rendererServices } from '../platform/index.js';
import { invalidateGameCardRuntimeCache } from '../gameCard/gameCardRuntimeCache.js';
import { loadPlayerSession } from '../gameCard/loadPlayerSession.js';
import GameCardErrorPanel from '../components/GameCardErrorPanel.jsx';

const GameCardRuntimeContext = React.createContext(null);

function GameCardRuntimeProvider({ children, platform = gameCardPlatform, mainSession }) {
  const [activeCard, setActiveCard] = React.useState(null);
  const [gameState, setGameState] = React.useState({});
  const [runtimeError, setRuntimeError] = React.useState(null);
  const [loading, setLoading] = React.useState(!mainSession);
  const [owned, setOwned] = React.useState(null);
  const [revision, setRevision] = React.useState(0);
  const current = React.useRef(null), token = React.useRef(0);

  const changeActiveCard = React.useCallback(async card => {
    const request = ++token.current;
    invalidateGameCardRuntimeCache();
    const previous = current.current;
    current.current = null;
    if (mainSession) {
      if (previous) await previous.dispose();
      if (request !== token.current) return;
      setOwned(null); setActiveCard(card || null); setRuntimeError(null); setLoading(false);
      if (!mainSession) setRevision(value => value + 1);
      return;
    }
    setLoading(true);
    try {
      await previous?.dispose();
      if (request !== token.current) return;
      const create = (await import('../platform/mainWorkerFactory.mjs')).createBrowserMainSession;
      const loaded = await loadPlayerSession(card, platform, rendererServices.config, create);
      if (request !== token.current) { await loaded.session.dispose(); return; }
      current.current = loaded.session;
      setOwned(current.current);
      setActiveCard(loaded.card);
      setGameState({}); setRuntimeError(null);
      setRevision(value => value + 1);
    } catch (error) {
      if (request === token.current) { setActiveCard(card || null); setOwned(null); setRuntimeError(normalizeGameCardError(error)); }
    } finally { if (request === token.current) setLoading(false); }
  }, [mainSession, platform]);

  const reloadActiveCard = React.useCallback(async () => {
    const request = ++token.current;
    invalidateGameCardRuntimeCache();
    try {
      const card = await platform.repository.getActiveCard();
      if (request !== token.current) return null;
      await changeActiveCard(card);
      return card || null;
    } catch (error) {
      if (request !== token.current) return null;
      setRuntimeError(normalizeGameCardError(error));
      setLoading(false);
      return null;
    }
  }, [platform, changeActiveCard]);

  React.useEffect(() => { reloadActiveCard(); }, [reloadActiveCard]);

  React.useEffect(() => () => { token.current += 1; void current.current?.dispose(); }, []);

  const value = React.useMemo(() => ({
    mainSession: mainSession || owned,
    activeCard,
    changeActiveCard,
    gameState,
    reloadActiveCard,
    runtimeError,
    setGameState,
    applyUiState: owned ? owned.setState : setGameState,
    setRuntimeError
  }), [activeCard, changeActiveCard, gameState, reloadActiveCard, runtimeError, mainSession, owned]);

  if (loading) return <div role="status">正在加载游戏…</div>;
  if (runtimeError && activeCard && !mainSession && !owned) return <div>
    <GameCardErrorPanel error={runtimeError} />
    <button onClick={async () => { await rendererServices.cards.setActive(null); await changeActiveCard(null); }}>返回普通聊天</button>
  </div>;
  return <GameCardRuntimeContext.Provider value={value}><React.Fragment key={revision}>{children}</React.Fragment></GameCardRuntimeContext.Provider>;
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
