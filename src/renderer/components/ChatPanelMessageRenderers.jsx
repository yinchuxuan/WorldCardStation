import React from 'react';
import { dispatchChatInputCommand } from '../chat/chatInputCommands.js';
import { resolveReadingSegments } from '../chat/segmentedReadingModel.js';
import { findLastRoleIndex, selectVisibleMessages } from '../chat/messageSelection.js';
import { MessageList } from './MessageList.jsx';
import MessageContent from './MessageContent.jsx';

const INPUT_ACTION_SELECTOR = [
  '[data-gc-chat-input-value]', '[data-gc-chat-input-value-from]',
  '[data-gc-chat-input-label]'
].join(', ');

function inputActionValue(target) {
  const directValue = target.getAttribute('data-gc-chat-input-value');
  if (directValue) return directValue;
  if (target.getAttribute('data-gc-chat-input-value-from') === 'text') {
    return target.textContent.replace(/\s+/g, ' ').trim();
  }
  const label = target.getAttribute('data-gc-chat-input-label');
  const selector = target.getAttribute('data-gc-chat-input-text-selector');
  const text = selector ? target.querySelector(selector)?.textContent : target.textContent;
  return label && text ? `${label}. ${text.replace(/\s+/g, ' ').trim()}` : '';
}

function handleInputActionClick(event) {
  const target = event.target?.closest?.(INPUT_ACTION_SELECTOR);
  if (!target) return false;
  const value = inputActionValue(target);
  if (!value) return false;
  event.preventDefault();
  event.stopPropagation();
  dispatchChatInputCommand({ type: 'chat.input.set', value, focus: true });
  return true;
}

function handleInputActionMouseDown(event) {
  if (!event.target?.closest?.(INPUT_ACTION_SELECTOR)) return false;
  event.preventDefault();
  return true;
}

function handleInputActionKeyDown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.repeat || event.isComposing) return false;
  const target = event.target?.closest?.(INPUT_ACTION_SELECTOR);
  const value = target ? inputActionValue(target) : '';
  const input = target?.ownerDocument?.querySelector('[data-gc-part="chat-input-textarea"]');
  if (!value || input?.disabled || input.value !== value) return false;
  event.preventDefault();
  event.stopPropagation();
  dispatchChatInputCommand({ type: 'chat.input.submit' });
  return true;
}

const ChatPanelMessageRenderers = {
  handleInputActionClick,

  resolveInputActionValue: inputActionValue,

  filterDialogueMessages(messages) {
    return selectVisibleMessages(messages);
  },

  renderMarkdown({ text, marked, DOMPurify, highlightQuotes, role = 'user', display, displayRevision, depth }) {
    return <div className="chat-message-bubble" data-gc-part="message-bubble">
      <MessageContent content={text} role={role} display={display} displayRevision={displayRevision} depth={depth}
        markdown={marked} sanitizer={DOMPurify} quoteHighlighter={highlightQuotes}
        onClick={handleInputActionClick} onKeyDown={handleInputActionKeyDown}
        onMouseDown={handleInputActionMouseDown} />
    </div>;
  },

  renderUserMsg({ msg, marked, DOMPurify, highlightQuotes, display, displayRevision, depth }) {
    return this.renderMarkdown({ text: msg.content, marked, DOMPurify, highlightQuotes, role: 'user', display, displayRevision, depth });
  },

  renderEditableUserMsg({ msg, renderIndex, renderMarkdown, editUserMessage }) {
    if (!editUserMessage?.canEdit?.(renderIndex)) return renderMarkdown(msg.content, msg);
    if (editUserMessage.isEditing(renderIndex)) {
      const rows = Math.max(1, String(editUserMessage.content || '').split('\n').length);
      return <div className="chat-message-bubble chat-message-edit-bubble" data-gc-part="message-bubble">
        <textarea className="chat-message-edit-textarea" data-gc-part="message-edit-textarea"
          value={editUserMessage.content} rows={rows} autoFocus aria-label="编辑用户消息"
          onChange={event => editUserMessage.change(event.target.value)}
          onClick={event => event.stopPropagation()}
          onKeyDown={event => { if (event.key === 'Escape') editUserMessage.cancel(); }} />
      </div>;
    }
    const bubble = renderMarkdown(msg.content, msg);
    return React.cloneElement(bubble, {
      className: `${bubble.props.className || ''} chat-message-editable-bubble`,
      onClick: event => { if (!event.defaultPrevented) editUserMessage.start(renderIndex); }
    });
  },

  renderAssistantMsg({ msg, idx, isStreaming, tw, currentThinking, showStreamThinking,
    setShowStreamThinking, toggleThinkingForMessage, marked, DOMPurify, highlightQuotes, display,
    displayRevision, segmentedReading, depth }) {
    const thinking = isStreaming ? currentThinking : msg._thinking;
    const showThinking = isStreaming ? showStreamThinking : msg._thinkingVisible === true;
    const rawContent = isStreaming ? msg.slice(0, tw.displayedCount) : msg.content;
    const segmented = segmentedReading?.enabled === true;
    const segments = segmented
      ? resolveReadingSegments(rawContent, display, segmentedReading.includeInputActions !== false, depth)
      : [];
    const pageIndex = Math.min(segmentedReading?.pageIndex || 0, Math.max(segments.length - 1, 0));
    const hasNext = segmented && pageIndex < segments.length - 1;
    const bubbleClass = segmented
      ? `chat-message-bubble segmented-reading-bubble${hasNext ? ' segmented-reading-ready' : ''}`
      : thinking ? 'chat-message-bubble bubble-clickable' : 'chat-message-bubble';
    const handleClick = segmented ? undefined : thinking ? () => {
      if (isStreaming) setShowStreamThinking(value => !value);
      else toggleThinkingForMessage(idx);
    } : undefined;
    const content = segmented ? (segments[pageIndex] || '') : rawContent;
    const contentNode = <MessageContent content={content} role="assistant" depth={depth}
      display={segmented ? undefined : display} displayRevision={segmented ? undefined : displayRevision}
      markdown={marked} sanitizer={DOMPurify} quoteHighlighter={highlightQuotes}
      onClick={handleInputActionClick} onKeyDown={handleInputActionKeyDown}
      onMouseDown={handleInputActionMouseDown} />;
    return <div className={bubbleClass} data-gc-part="message-bubble" onClick={handleClick}
      data-segment-count={segmented ? segments.length : undefined}>
      {!segmented && thinking && showThinking ? <div className="chat-thinking-text" data-gc-part="message-thinking">
        {thinking}
      </div> : null}
      {segmented
        ? <div key={pageIndex} className="segmented-reading-page">{contentNode}</div>
        : contentNode}
    </div>;
  },

  renderRetryBtn({ isLast, isLoading, handleRetry }) {
    if (!isLast || isLoading) return null;
    return <button className="md-btn retry-btn retry-side-indicator"
      onClick={event => { event.stopPropagation(); handleRetry(); }}
      title="重新生成" aria-label="重新生成回复">
      <span className="material-icons">refresh</span>
    </button>;
  },

  renderMessages({ messages, isLoading, tw, renderMarkdown,
    renderAssistantMsg, renderRetryBtn, collapseRenderer, isHistoryExpanded, handleExpandHistory,
    modelConfig, editUserMessage }) {
    const visibleMessages = this.filterDialogueMessages(messages);
    if (visibleMessages.length === 0 && !isLoading) {
      return <div className="chat-empty">
        <span className="material-icons empty-icon">question_answer</span>
        <div>开始对话</div>
        {!modelConfig?.apiUrl ? <div className="chat-empty-hint">请先配置模型 API</div> : null}
      </div>;
    }
    const renderUserMessage = (msg, renderIndex) => (
      this.renderEditableUserMsg({ msg, renderIndex, renderMarkdown, editUserMessage })
    );
    renderUserMessage.usesMessageObject = true;
    if (collapseRenderer) {
      return collapseRenderer.render({ rawMessages: visibleMessages, isLoading, typewriter: tw, renderUserMessage,
        renderAssistantMessage: renderAssistantMsg, renderRetryButton: renderRetryBtn, isExpanded: isHistoryExpanded,
        onExpand: handleExpandHistory });
    }
    const lastUserIndex = findLastRoleIndex(visibleMessages, 'user');
    const displayMessages = isLoading ? [...visibleMessages, {
      id: tw.streamMessageId || `streaming-${visibleMessages.length}`,
      role: 'assistant',
      content: typeof tw.streamContent === 'string' ? tw.streamContent : '',
      _renderIndex: visibleMessages.length,
      _streaming: true
    }] : visibleMessages;
    return <div className="chat-messages-layer" data-gc-part="message-surface">
      <MessageList messages={displayMessages} lastUserIndex={lastUserIndex}
        renderUser={renderUserMessage} renderAssistant={renderAssistantMsg}
        renderRetryButton={retrySource => renderRetryBtn(retrySource, isLoading)} />
    </div>;
  }
};

export default ChatPanelMessageRenderers;
