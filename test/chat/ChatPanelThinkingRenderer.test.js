const React = require('react');
const { render, fireEvent } = require('@testing-library/react');
const DOMPurify = require('dompurify')(window);
const { marked } = require('marked');
const renderers = require('../../src/renderer/components/ChatPanelMessageRenderers').default;
const MessageCollapseRenderer = require('../../src/renderer/components/MessageCollapseRenderer').default;

function renderAssistant(msg, toggle = jest.fn()) {
  return render(renderers.renderAssistantMsg({ msg, idx: 0, isStreaming: false, tw: null, currentThinking: '', showStreamThinking: false,
      setShowStreamThinking: jest.fn(), toggleThinkingForMessage: toggle, marked, DOMPurify,
      highlightQuotes: value => value }));
}

function renderMarkdown(text) {
  return React.createElement('div', { className: 'chat-message-bubble' }, text);
}

describe('ChatPanel thinking renderer', () => {
  test('adds clickable class and toggles stored thinking messages', () => {
    const toggle = jest.fn();
    const { container } = renderAssistant({
      role: 'assistant',
      content: 'Visible **answer**',
      _thinking: 'Hidden reasoning'
    }, toggle);

    const bubble = container.querySelector('.chat-message-bubble');
    expect(bubble.classList.contains('bubble-clickable')).toBe(true);
    expect(container.querySelector('.chat-thinking-text')).toBeNull();

    fireEvent.click(bubble);
    expect(toggle).toHaveBeenCalledWith(0);
    expect(container.querySelector('.chat-bubble-content').innerHTML).toContain('<strong>answer</strong>');
  });

  test('renders thinking text only when the message is expanded', () => {
    const { container } = renderAssistant({
      role: 'assistant',
      content: 'Answer',
      _thinking: 'Hidden reasoning',
      _thinkingVisible: true
    });

    expect(container.querySelector('.chat-thinking-text').textContent).toBe('Hidden reasoning');
  });

  test('keeps normal assistant messages non-clickable', () => {
    const { container } = renderAssistant({ role: 'assistant', content: 'Plain answer' });

    const bubble = container.querySelector('.chat-message-bubble');
    expect(bubble.classList.contains('bubble-clickable')).toBe(false);
  });

  test('streaming thinking reopens by clicking streamed content after hidden', () => {
    const setShowStreamThinking = jest.fn();
    const { container } = render(renderers.renderAssistantMsg({ msg: 'partial answer', idx: 0, isStreaming: true, tw: { displayedCount: 7 }, currentThinking: 'stream reasoning',
      showStreamThinking: false, setShowStreamThinking, toggleThinkingForMessage: jest.fn(), marked, DOMPurify,
      highlightQuotes: value => value }));

    expect(container.querySelector('.chat-thinking-text')).toBeNull();
    expect(container.querySelector('.chat-bubble-content').textContent.trim()).toBe('partial');
    fireEvent.click(container.querySelector('.chat-message-bubble.bubble-clickable'));
    expect(setShowStreamThinking).toHaveBeenCalled();
    expect(setShowStreamThinking.mock.calls[0][0](false)).toBe(true);
  });

  test('toggles original assistant index after hidden messages are filtered', () => {
    const toggle = jest.fn();
    const renderAssistantMsg = (msg, idx, isStreaming) => renderers.renderAssistantMsg({ msg, idx, isStreaming, tw: { displayedCount: 0 }, currentThinking: '', showStreamThinking: true,
      setShowStreamThinking: jest.fn(), toggleThinkingForMessage: toggle, marked, DOMPurify,
      highlightQuotes: value => value });
    const result = renderers.renderMessages({ messages: [
        { role: 'system', content: 'rules', _meta: { visibility: 'llm_only' } },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'answer', _thinking: 'reasoning' }
      ],
      isLoading: false, tw: {}, renderMarkdown, renderAssistantMsg, renderRetryBtn: () => null,
      collapseRenderer: null, isHistoryExpanded: true, handleExpandHistory: jest.fn(),
      modelConfig: { apiUrl: 'http://api.example.com' } });

    const { container } = render(result);
    fireEvent.click(container.querySelector('.chat-message-bubble.bubble-clickable'));
    expect(toggle).toHaveBeenCalledWith(2);
  });

  test('collapsed renderer toggles original assistant index after hidden messages', () => {
    const toggle = jest.fn();
    const renderAssistantMsg = (msg, idx, isStreaming) => renderers.renderAssistantMsg({ msg, idx, isStreaming, tw: { displayedCount: 0 }, currentThinking: '', showStreamThinking: true,
      setShowStreamThinking: jest.fn(), toggleThinkingForMessage: toggle, marked, DOMPurify,
      highlightQuotes: value => value });
    const result = renderers.renderMessages({ messages: [
        { role: 'system', content: 'rules', _meta: { visibility: 'llm_only' } },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'answer', _thinking: 'reasoning' }
      ],
      isLoading: false, tw: {}, renderMarkdown, renderAssistantMsg, renderRetryBtn: () => null,
      collapseRenderer: MessageCollapseRenderer, isHistoryExpanded: true, handleExpandHistory: jest.fn(),
      modelConfig: { apiUrl: 'http://api.example.com' } });

    const { container } = render(result);
    fireEvent.click(container.querySelector('.chat-message-bubble.bubble-clickable'));
    expect(toggle).toHaveBeenCalledWith(2);
  });
});
