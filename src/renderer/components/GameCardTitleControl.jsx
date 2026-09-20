import React from 'react';
import ChatSessionManager from './ChatSessionManager.jsx';
import GameCardErrorPanel from './GameCardErrorPanel.jsx';
import GameCardSwitcher from './GameCardSwitcher.jsx';
import { useGameCardRuntime } from '../chat/GameCardRuntimeProvider.jsx';
import { PropTypes } from './componentPropTypes.js';
import { savePolicy } from '../platform/index.js';

function GameCardTitleControl({ modelName, isLoading = false, saveControl, onBeforeSessionChange, onSessionChanged, onSwitchSession, onActivateCard, onImportCard, onUninstallCard, audioControl, onImportError, cardRepository }) {
  const { activeCard: card } = useGameCardRuntime();
  const [error, setError] = React.useState(null);

  const reportError = (nextError) => {
    setError(nextError);
    onImportError?.(nextError);
  };

  const title = card ? (card.name || card.id) : '普通聊天';
  const errorTitle = error ? `${error.title || '游戏卡操作失败'}: ${error.message || error.error || ''}` : '';

  return (
    <div className={`game-card-title-control ${card ? 'loaded' : ''}`} data-gc-part="game-card-title" title={errorTitle || title}>
      <GameCardSwitcher activeCard={card} isLoading={isLoading}
        onActivate={onActivateCard} onImport={onImportCard} onUninstall={onUninstallCard} onError={reportError}
        repository={cardRepository} />
      <span className={`config-status game-card-model-status${modelName ? ' configured' : ''}`}
        data-gc-part="model-status" title={modelName || '模型未配置'}>
        <span className="game-card-model-status-label">{modelName || '模型未配置'}</span>
      </span>
      <div className="game-card-title-actions" data-gc-part="game-card-title-actions">
        {audioControl || null}
        <ChatSessionManager
          saveControl={savePolicy === 'manual' ? saveControl : undefined}
          disabled={isLoading || saveControl?.saving}
          cardId={card?.id || ''}
          onBeforeSessionChange={onBeforeSessionChange}
          onAfterSessionChange={savePolicy === 'manual' ? saveControl?.endLeave : undefined}
          onSessionChanged={onSessionChanged}
          onSwitchSession={onSwitchSession}
        />
        {error ? (
          <button className="game-card-title-error" data-gc-part="game-card-title-error" type="button" aria-label={errorTitle} onClick={(event) => event.stopPropagation()}>
            <span className="material-icons">error</span>
          </button>
        ) : null}
      </div>
      {error && !onImportError ? <GameCardErrorPanel error={error} variant="import" /> : null}
    </div>
  );
}

GameCardTitleControl.propTypes = {
  modelName: PropTypes.string,
  isLoading: PropTypes.bool,
  saveControl: PropTypes.object,
  onBeforeSessionChange: PropTypes.func,
  onSessionChanged: PropTypes.func,
  onSwitchSession: PropTypes.func,
  onActivateCard: PropTypes.func.isRequired,
  onImportCard: PropTypes.func.isRequired,
  onUninstallCard: PropTypes.func.isRequired,
  audioControl: PropTypes.node,
  onImportError: PropTypes.func,
  cardRepository: PropTypes.shape({ list: PropTypes.func.isRequired })
};

export default GameCardTitleControl;
