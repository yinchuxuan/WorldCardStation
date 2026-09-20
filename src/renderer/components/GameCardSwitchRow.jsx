import React from 'react';
import { gameCard, PropTypes } from './componentPropTypes.js';

function GameCardSwitchRow({ active, busy, card, onActivate, onUninstall, onUpdate, removing }) {
  const name = card?.name || card?.id || '普通聊天';
  return <div className="game-card-switch-item">
    <button type="button"
      className={`game-card-switch-row${active ? ' active' : ''}`}
      onClick={event => onActivate(event, card)} disabled={busy}>
      <span className="game-card-switch-state" aria-hidden="true" />
      {card?.coverUrl && <img src={card.coverUrl} alt={`${name}封面`} className="game-card-switch-cover" referrerPolicy="no-referrer" />}
      <span className="game-card-switch-name">{name}</span>
      {card?.cardVersion && <span className="config-status">{card.cardVersion}</span>}
    </button>
    {card && onUpdate ? <button type="button" className="game-card-switch-update"
      onClick={event => onUpdate(event, card)} disabled={busy}
      title={`用酒馆卡更新 ${name}`} aria-label={`用酒馆卡更新 ${name}`}>
      <span className="material-icons" aria-hidden="true">upload_file</span>
    </button> : null}
    {card && onUninstall ? <button type="button" className="game-card-switch-remove"
      onClick={event => onUninstall(event, card)} disabled={busy}
      title={`卸载 ${name}`} aria-label={`卸载 ${name}`}>
      <span className={`material-icons${removing ? ' importing' : ''}`}>
        {removing ? 'progress_activity' : 'delete'}
      </span>
    </button> : null}
  </div>;
}

GameCardSwitchRow.propTypes = {
  active: PropTypes.bool,
  busy: PropTypes.bool,
  card: gameCard,
  onActivate: PropTypes.func.isRequired,
  onUninstall: PropTypes.func,
  onUpdate: PropTypes.func,
  removing: PropTypes.bool
};

export default GameCardSwitchRow;
