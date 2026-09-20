import React from 'react';
import PropTypes from 'prop-types';

function GameCardTransferStatus({ status, onCancel }) {
  if (status.state === 'idle') return null;
  return <div className="game-card-import-status" data-state={status.state} role="status" aria-live="polite">
    <span className="material-icons" aria-hidden="true">
      {status.state === 'success' ? 'check_circle' : status.state === 'error' ? 'error' : 'hourglass_top'}
    </span>
    <span className="game-card-import-message">{status.message}</span>
    {status.state === 'importing' && <span className="game-card-import-progress" role="progressbar" aria-label={onCancel ? '游戏资源准备进度' : '游戏卡导入进度'}><span /></span>}
    {onCancel && <button type="button" className="game-card-transfer-cancel" onClick={onCancel}>取消下载</button>}
  </div>;
}
GameCardTransferStatus.propTypes = { status: PropTypes.object.isRequired, onCancel: PropTypes.func };
export default GameCardTransferStatus;
