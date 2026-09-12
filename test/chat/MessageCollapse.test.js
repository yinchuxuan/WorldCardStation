/**
 * Tests for MessageCollapseRenderer
 * Verifies last user message pinning and history collapse
 */

const MessageCollapseRenderer = require('../../src/renderer/components/MessageCollapseRenderer.jsx').default;
const R = require('react');
const { render: _render } = require('@testing-library/react');

describe('MessageCollapseRenderer', () => {
  test('findLastUserIndex returns index of last user message', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'again' }
    ];
    expect(MessageCollapseRenderer.findLastUserIndex(msgs)).toBe(2);
  });

  test('findLastUserIndex returns -1 when no user messages', () => {
    const msgs = [
      { role: 'assistant', content: 'hi' },
      { role: 'assistant', content: 'bye' }
    ];
    expect(MessageCollapseRenderer.findLastUserIndex(msgs)).toBe(-1);
  });

  test('findLastUserIndex with empty array returns -1', () => {
    expect(MessageCollapseRenderer.findLastUserIndex([])).toBe(-1);
  });

  test('render shows collapsed indicator when history should be collapsed', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'response' },
      { role: 'user', content: 'second' }
    ];
    const mockTw = { displayedCount: 0, streamContent: { slice: () => '', content: '' } };
    const renderMarkdown = (text) => R.createElement('div', { className: 'content' }, text);
    const renderAssistantMsg = (msg) => R.createElement('div', { className: 'assistant' }, msg.content);
    const renderRetryBtn = () => null;

    const result = MessageCollapseRenderer.render({ rawMessages: messages, isLoading: false, typewriter: mockTw, renderUserMessage: renderMarkdown,
      renderAssistantMessage: renderAssistantMsg, renderRetryButton: renderRetryBtn, isExpanded: false,
      onExpand: () => {} });

    const container = _render(result);
    expect(container.container.querySelector('.collapsed-history')).toBeInTheDocument();
    expect(container.container.querySelector('.collapsed-history-indicator')).toBeInTheDocument();
  });

  test('render shows all messages when expanded', () => {
    const messages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'response' },
      { role: 'user', content: 'second' }
    ];
    const mockTw = { displayedCount: 0, streamContent: { slice: () => '', content: '' } };
    const renderMarkdown = (text) => R.createElement('div', { className: 'content' }, text);
    const renderAssistantMsg = (msg) => R.createElement('div', { className: 'assistant' }, msg.content);
    const renderRetryBtn = () => null;

    const result = MessageCollapseRenderer.render({ rawMessages: messages, isLoading: false, typewriter: mockTw, renderUserMessage: renderMarkdown,
      renderAssistantMessage: renderAssistantMsg, renderRetryButton: renderRetryBtn, isExpanded: true,
      onExpand: () => {} });

    const container = _render(result);
    expect(container.container.querySelector('.collapsed-history')).not.toBeInTheDocument();
    expect(container.container.querySelector('.pinned-divider')).toBeInTheDocument();
  });

  test('render includes pinned divider', () => {
    const messages = [
      { role: 'user', content: 'test' }
    ];
    const mockTw = { displayedCount: 0, streamContent: { slice: () => '', content: '' } };
    const renderMarkdown = (text) => R.createElement('div', { className: 'content' }, text);
    const renderAssistantMsg = () => null;
    const renderRetryBtn = () => null;

    const result = MessageCollapseRenderer.render({ rawMessages: messages, isLoading: false, typewriter: mockTw, renderUserMessage: renderMarkdown,
      renderAssistantMessage: renderAssistantMsg, renderRetryButton: renderRetryBtn, isExpanded: false,
      onExpand: () => {} });

    const container = _render(result);
    expect(container.container.querySelector('.pinned-divider')).toBeInTheDocument();
  });

  test('render shows streaming message when loading', () => {
    const messages = [
      { role: 'user', content: 'test' }
    ];
    const mockTw = { displayedCount: 0, streamContent: { slice: () => '', content: '' } };
    const renderMarkdown = (text) => R.createElement('div', { className: 'content' }, text);
    const renderAssistantMsg = () => R.createElement('div', { className: 'streaming' }, 'streaming');
    const renderRetryBtn = () => null;

    const result = MessageCollapseRenderer.render({ rawMessages: messages, isLoading: true, typewriter: mockTw, renderUserMessage: renderMarkdown,
      renderAssistantMessage: renderAssistantMsg, renderRetryButton: renderRetryBtn, isExpanded: false,
      onExpand: () => {} });

    const container = _render(result);
    expect(container.container.querySelector('.streaming')).toBeInTheDocument();
    expect(container.container.querySelector('.streaming-message-row')).toBeInTheDocument();
    const rows = Array.from(container.container.querySelectorAll('.chat-message-row'));
    expect(rows[0].textContent).toContain('test');
    expect(rows[1].querySelector('.streaming')).toBeInTheDocument();
  });

  test('render returns null for empty messages and not loading', () => {
    const result = MessageCollapseRenderer.render({ rawMessages: [], isLoading: false, typewriter: null, renderUserMessage: () => {},
      renderAssistantMessage: () => {}, renderRetryButton: () => null, isExpanded: false, onExpand: () => {} });
    expect(result).toBe(null);
  });

  test('collapsed indicator shows correct count', () => {
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' }
    ];
    const mockTw = { displayedCount: 0, streamContent: { slice: () => '', content: '' } };
    const renderMarkdown = (text) => R.createElement('div', { className: 'content' }, text);
    const renderAssistantMsg = () => null;
    const renderRetryBtn = () => null;

    const result = MessageCollapseRenderer.render({ rawMessages: messages, isLoading: false, typewriter: mockTw, renderUserMessage: renderMarkdown,
      renderAssistantMessage: renderAssistantMsg, renderRetryButton: renderRetryBtn, isExpanded: false,
      onExpand: () => {} });

    const container = _render(result);
    expect(container.container.textContent).toContain('4');
  });
});
