import DOMPurify from 'dompurify';
import { marked } from 'marked';
import ChatPanelMessageRenderers from '../components/ChatPanelMessageRenderers.jsx';
import { highlightQuotes } from '../components/highlightQuotes.js';
import { PropTypes } from '../components/componentPropTypes.js';

function ChatMessages({ display, displayRevision, depths, messages, isLoading, typewriter,
  currentThinking, showStreamThinking, setShowStreamThinking, toggleThinking, handleRetry,
  scroll, modelConfig, editUserMessage }) {
  const rendering = { marked, DOMPurify, highlightQuotes, display, displayRevision };
  const renderUser = (text, message) => ChatPanelMessageRenderers.renderUserMsg({
    ...rendering, msg: { content: text }, depth: depths[message?._renderIndex]
  });
  const renderAssistant = (msg, index, streaming) => ChatPanelMessageRenderers.renderAssistantMsg({
    ...rendering, msg, idx: index, isStreaming: streaming, tw: typewriter,
    currentThinking, showStreamThinking, setShowStreamThinking, toggleThinkingForMessage: toggleThinking,
    depth: streaming ? 0 : depths[index]
  });
  return ChatPanelMessageRenderers.renderMessages({
    messages, isLoading, tw: typewriter,
    renderMarkdown: renderUser, renderAssistantMsg: renderAssistant,
    renderRetryBtn: (isLast, isLoading) => ChatPanelMessageRenderers.renderRetryBtn({ isLast, isLoading, handleRetry }),
    isHistoryExpanded: scroll.isHistoryExpanded,
    handleExpandHistory: scroll.expandHistory, modelConfig, editUserMessage
  });
}

ChatMessages.propTypes = {
  display: PropTypes.object,
  displayRevision: PropTypes.string,
  depths: PropTypes.array.isRequired,
  messages: PropTypes.array.isRequired,
  isLoading: PropTypes.bool.isRequired,
  typewriter: PropTypes.object.isRequired,
  currentThinking: PropTypes.string,
  showStreamThinking: PropTypes.bool.isRequired,
  setShowStreamThinking: PropTypes.func.isRequired,
  toggleThinking: PropTypes.func.isRequired,
  handleRetry: PropTypes.func.isRequired,
  scroll: PropTypes.object.isRequired,
  modelConfig: PropTypes.object,
  editUserMessage: PropTypes.object.isRequired
};

export default ChatMessages;
