import React from 'react';
import { PropTypes } from './componentPropTypes.js';

// The same visual element is decorative on Web and interactive with desktop tracing.
function ChatHeaderEmblem({ buttonProps, children }) {
  const content = <>
    <span className="material-icons game-card-title-icon" data-gc-part="game-card-title-icon"
      data-icon="square" aria-hidden="true">square</span>
    {children}
  </>;
  if (!buttonProps) return <span className="chat-header-emblem" aria-hidden="true">{content}</span>;
  return <button {...buttonProps} type="button"
    className={`chat-header-emblem ${buttonProps.className || ''}`}>{content}</button>;
}

ChatHeaderEmblem.propTypes = { buttonProps: PropTypes.object, children: PropTypes.node };

export default ChatHeaderEmblem;
