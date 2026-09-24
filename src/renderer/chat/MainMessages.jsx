import React from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { PropTypes } from '../components/componentPropTypes.js';
import { MessageRow } from '../components/MessageList.jsx';
import { highlightQuotes } from '../components/highlightQuotes.js';
import Renderers from '../components/ChatPanelMessageRenderers.jsx';
import { selectVisibleMessages } from './messageSelection.js';

function MainMessages({ messages, reading, display, displayRevision, isLoading, handleRetry }) {
  const page = reading.page;
  const segmented = page?.record.mode === 'segmented';
  const shown = selectVisibleMessages(page && (segmented || reading.ui?.atLatest === false) ? [{ ...page.record, content: page.text }] : messages);
  return <div className="chat-messages-layer" data-gc-part="message-surface">
    {shown.map((msg, index) => <MessageRow key={msg.id} message={msg}
      retrySource={index === shown.length - 1} retryButton={Renderers.renderRetryBtn({
      isLast: index === shown.length - 1, isLoading, handleRetry
    })}>
      <div className={segmented ? 'segmented-reading-page' : undefined} key={segmented ? page.id : msg.id}>
        {Renderers.renderMarkdown({ text: msg.content, role: msg.role, display, displayRevision, depth: shown.length - index - 1,
          marked, DOMPurify, highlightQuotes })}
      </div>
    </MessageRow>)}
    {!shown.length ? <div className="chat-empty">{isLoading ? '正在生成…' : '开始对话'}</div> : null}
  </div>;
}
MainMessages.propTypes = { messages: PropTypes.array.isRequired, reading: PropTypes.object.isRequired,
  display: PropTypes.object, displayRevision: PropTypes.string, isLoading: PropTypes.bool.isRequired, handleRetry: PropTypes.func.isRequired };
export default MainMessages;
