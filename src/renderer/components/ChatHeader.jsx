import React from 'react';
import { PropTypes } from './componentPropTypes.js';
import RuntimeTraceControl from './RuntimeTraceControl.jsx';
import { capabilities } from '../platform/index.js';

function ChatHeader({ children, onToggleHistory, icon = 'extension' }) {
  const [hovered, setHovered] = React.useState(false);
  return <>
    <div className="chat-header-hover-trigger" data-gc-part="chat-header-trigger"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} />
    <div className={`chat-header chat-header-clickable${hovered ? ' chat-header-visible' : ''}`}
      data-gc-part="chat-header" onClick={onToggleHistory}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {capabilities?.diskTrace !== false && <RuntimeTraceControl icon={icon} />}
      {children}
    </div>
  </>;
}

ChatHeader.propTypes = { children: PropTypes.node, onToggleHistory: PropTypes.func.isRequired, icon: PropTypes.string };

export default ChatHeader;
