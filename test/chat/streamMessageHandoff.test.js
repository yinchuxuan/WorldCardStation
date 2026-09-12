const React = require('react');
const { render } = require('@testing-library/react');
const MessageCollapseRenderer = require(
  '../../src/renderer/components/MessageCollapseRenderer.jsx'
).default;
const { buildReadingEntries } = require('../../src/renderer/chat/segmentedReadingModel.js');

function renderAssistant(value, _index, streaming) {
  const content = streaming ? value : value.content;
  return <div className="chat-message-bubble">
    <div className="segmented-reading-page">{content}</div>
  </div>;
}

function HandoffView({ isLoading, messages }) {
  return MessageCollapseRenderer.render({ rawMessages: messages, isLoading, typewriter: { streamContent: '当前段落', streamMessageId: 'reply' },
      renderUserMessage: content => <div>{content}</div>, renderAssistantMessage: renderAssistant,
      renderRetryButton: () => null, isExpanded: false, onExpand: () => {} });
}

describe('stream message handoff', () => {
  test('uses the final assistant id for the streaming reading entry', () => {
    const streaming = buildReadingEntries(
      [{ id: 'user', role: 'user', content: '继续' }],
      true, '当前段落', 4, undefined, '当前段落', 'reply'
    );
    const completed = buildReadingEntries([
      { id: 'user', role: 'user', content: '继续' },
      { id: 'reply', role: 'assistant', content: '当前段落' }
    ], false, '', 0);

    expect(streaming.at(-1).key).toBe('reply');
    expect(completed.at(-1).key).toBe('reply');
  });

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
