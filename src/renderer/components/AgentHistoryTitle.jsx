import React from 'react';
import { PropTypes } from './componentPropTypes.js';

function AgentHistoryTitle({ contexts, selected, onSelect }) {
  return <><span className="header-title">msg历史记录</span>
    {Object.keys(contexts).length ? <div role="group" aria-label="Agent 消息历史" onClick={event => event.stopPropagation()}>
      {Object.keys(contexts).map(id => <button key={id} className="md-btn" type="button"
        aria-pressed={selected === id} onClick={() => onSelect(id)}>{id}</button>)}
    </div> : null}
  </>;
}
AgentHistoryTitle.propTypes = { contexts: PropTypes.object.isRequired, selected: PropTypes.string, onSelect: PropTypes.func.isRequired };
export default AgentHistoryTitle;
