import React from 'react';
import { findLastRoleIndex } from '../chat/messageSelection.js';
import { MessageList } from './MessageList.jsx';
import useCollapsedHistory from '../chat/useCollapsedHistory.js';
import { message, PropTypes } from './componentPropTypes.js';

function CollapsedMessageList({ messages, isLoading, typewriter, renderUserMessage,
  renderAssistantMessage, renderRetryButton, isExpanded, onExpand }) {
  const pull = useCollapsedHistory(isExpanded, onExpand);
  const lastUserIndex = findLastRoleIndex(messages, 'user');
  const collapsed = !isExpanded && messages.length > 1 && lastUserIndex >= 0;
  const before = collapsed ? [] : messages.slice(0, Math.max(lastUserIndex, 0));
  const pinned = messages.slice(Math.max(lastUserIndex, 0));
  if (isLoading) pinned.push({
    id: typewriter.streamMessageId || `streaming-${messages.length}`,
    role: 'assistant',
    content: typeof typewriter.streamContent === 'string' ? typewriter.streamContent : '',
    _renderIndex: messages.length,
    _streaming: true
  });
  const retry = isRetrySource => renderRetryButton(isRetrySource, isLoading);

  return <div className={`collapsed-message-view${isExpanded ? ' expanded' : ''}`}
    data-gc-part="collapsed-message-view" onWheel={pull.onWheel}>
    <div className="collapse-inner-wrapper" data-gc-part="message-list" style={pull.style}>
      {collapsed && lastUserIndex > 0 ? <div className="collapsed-history">
        <div className="collapsed-history-indicator">
          <span className="material-icons">expand_more</span>
          <span>{lastUserIndex} 条更早的消息</span>
        </div>
      </div> : null}
      <MessageList messages={before} lastUserIndex={-1} renderUser={renderUserMessage}
        renderAssistant={renderAssistantMessage} renderRetryButton={() => null} keyPrefix="history" />
      {lastUserIndex >= 0 ? <div className="pinned-divider" data-gc-part="message-divider" /> : null}
      <MessageList messages={pinned} lastUserIndex={lastUserIndex >= 0 ? 0 : -1}
        renderUser={renderUserMessage} renderAssistant={renderAssistantMessage}
        renderRetryButton={retry} keyPrefix="pinned" />
    </div>
  </div>;
}

CollapsedMessageList.propTypes = {
  messages: PropTypes.arrayOf(message).isRequired,
  isLoading: PropTypes.bool.isRequired,
  typewriter: PropTypes.shape({
    streamContent: PropTypes.string,
    streamMessageId: PropTypes.string
  }).isRequired,
  renderUserMessage: PropTypes.func.isRequired,
  renderAssistantMessage: PropTypes.func.isRequired,
  renderRetryButton: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool.isRequired,
  onExpand: PropTypes.func
};

const MessageCollapseRenderer = {
  render({ messages, isLoading, typewriter, renderUserMessage, renderAssistantMessage,
    renderRetryButton, isExpanded, onExpand }) {
    if (messages.length === 0 && !isLoading) return null;
    return <CollapsedMessageList messages={messages} isLoading={isLoading} typewriter={typewriter}
      renderUserMessage={renderUserMessage} renderAssistantMessage={renderAssistantMessage}
      renderRetryButton={renderRetryButton} isExpanded={isExpanded} onExpand={onExpand} />;
  }
};

export default MessageCollapseRenderer;
