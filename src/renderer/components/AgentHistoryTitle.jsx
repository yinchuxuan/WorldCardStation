import React from 'react';
import { PropTypes } from './componentPropTypes.js';

function AgentHistoryTitle({ contexts, selected, onSelect }) {
  const ids = Object.keys(contexts);
  const index = Math.max(0, ids.indexOf(selected));
  const selectRelative = offset => onSelect(ids[(index + offset + ids.length) % ids.length]);
  return <><span className="header-title">msg历史记录</span>
    {ids.length ? <div className="agent-history-switcher" role="group" aria-label="Agent 消息历史"
      onClick={event => event.stopPropagation()}>
      <button className="agent-history-arrow" type="button" aria-label="上一个 Agent"
        disabled={ids.length < 2} onClick={() => selectRelative(-1)}>
        <span className="material-icons" aria-hidden="true">chevron_left</span>
      </button>
      <span className="config-status game-card-model-status configured" title={ids[index]} aria-live="polite">
        <span className="game-card-model-status-label">{ids[index]}</span>
      </span>
      <button className="agent-history-arrow" type="button" aria-label="下一个 Agent"
        disabled={ids.length < 2} onClick={() => selectRelative(1)}>
        <span className="material-icons" aria-hidden="true">chevron_right</span>
      </button>
    </div> : null}
  </>;
}
AgentHistoryTitle.propTypes = { contexts: PropTypes.object.isRequired, selected: PropTypes.string, onSelect: PropTypes.func.isRequired };
export default AgentHistoryTitle;
