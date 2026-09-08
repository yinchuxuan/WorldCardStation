import React from 'react';
import * as displayRules from '../gameCard/displayRules.js';
import { PropTypes } from './componentPropTypes.js';

function applyRules(content, role, display, depth) {
  if (role === 'assistant') return displayRules.applyAssistantDisplayRules(content, display, depth);
  if (role === 'user') return displayRules.applyUserDisplayRules(content, display, depth);
  return content;
}

function MessageContent({ content, role, display, displayRevision, depth, markdown, sanitizer,
  quoteHighlighter, onClick, onKeyDown, onMouseDown }) {
  const html = React.useMemo(() => {
    const displayed = applyRules(content, role, display, depth);
    const rawHtml = markdown ? markdown.parse(displayed) : displayed;
    const sanitized = sanitizer ? sanitizer.sanitize(rawHtml) : rawHtml;
    return quoteHighlighter(sanitized);
  }, [content, display, displayRevision, depth, markdown, quoteHighlighter, role, sanitizer]);

  return <div className="chat-bubble-content" data-gc-part="message-content"
    onClick={onClick} onKeyDown={onKeyDown} onMouseDown={onMouseDown}
    dangerouslySetInnerHTML={{ __html: html }} />;
}

MessageContent.propTypes = {
  content: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired,
  display: PropTypes.object,
  displayRevision: PropTypes.string,
  depth: PropTypes.number,
  markdown: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ parse: PropTypes.func.isRequired })
  ]),
  sanitizer: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ sanitize: PropTypes.func.isRequired })
  ]),
  quoteHighlighter: PropTypes.func.isRequired,
  onClick: PropTypes.func,
  onKeyDown: PropTypes.func,
  onMouseDown: PropTypes.func
};

function sameDisplay(previous, next) {
  if (previous.displayRevision !== undefined || next.displayRevision !== undefined) {
    return previous.displayRevision === next.displayRevision;
  }
  return previous.display === next.display;
}

function sameMessageContent(previous, next) {
  const usesDepth = displayRules.getRules(next.display, next.role).some(rule => rule?.enabled !== false
    && ((rule?.minDepth ?? undefined) !== undefined || (rule?.maxDepth ?? undefined) !== undefined));
  return previous.content === next.content
    && previous.role === next.role
    && (!usesDepth || previous.depth === next.depth)
    && sameDisplay(previous, next)
    && previous.markdown === next.markdown
    && previous.sanitizer === next.sanitizer
    && previous.quoteHighlighter === next.quoteHighlighter
    && previous.onClick === next.onClick
    && previous.onKeyDown === next.onKeyDown
    && previous.onMouseDown === next.onMouseDown;
}

export default React.memo(MessageContent, sameMessageContent);
