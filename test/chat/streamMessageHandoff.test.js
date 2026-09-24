const React = require('react');
const { render } = require('@testing-library/react');
const MessageCollapseRenderer = require(
  '../../src/renderer/components/MessageCollapseRenderer.jsx'
).default;

function renderAssistant(value, _index, streaming) {
  const content = streaming ? value : value.content;
  return <div className="chat-message-bubble">
    <div className="segmented-reading-page">{content}</div>
  </div>;
}

function HandoffView({ isLoading, messages }) {
  return MessageCollapseRenderer.render({ messages, isLoading, typewriter: { streamContent: '当前段落', streamMessageId: 'reply' },
      renderUserMessage: message => <div>{message.content}</div>, renderAssistantMessage: renderAssistant,
      renderRetryButton: () => null, isExpanded: false, onExpand: () => {} });
}

describe('stream message handoff', () => {
  test('reuses the text DOM when streaming becomes a completed message', () => {
    const user = { id: 'user', role: 'user', content: '继续' };
    const view = render(<HandoffView isLoading messages={[user]} />);
    const streamingRow = view.container.querySelector('[data-message-key="reply"]');
    const streamingPage = streamingRow.querySelector('.segmented-reading-page');

    view.rerender(<HandoffView isLoading={false} messages={[
      user,
      { id: 'reply', role: 'assistant', content: '当前段落' }
    ]} />);

    const completedRow = view.container.querySelector('[data-message-key="reply"]');
    expect(completedRow).toBe(streamingRow);
    expect(completedRow.querySelector('.segmented-reading-page')).toBe(streamingPage);
  });
});
