const React = require('react');
const { render } = require('@testing-library/react');
const MessageRenderers = require('../../src/renderer/components/ChatPanelMessageRenderers').default;

describe('ChatPanelMessageRenderers streaming layout', () => {
  test('wraps streaming assistant output in a message row', () => {
    const result = MessageRenderers.renderMessages({ messages: [{ role: 'user', content: 'Question' }], isLoading: true,
      tw: { streamContent: 'streaming response', displayedCount: 18 },
      renderMarkdown: jest.fn(content => React.createElement('div', null, content)),
      renderAssistantMsg: jest.fn(() => React.createElement('div', null, 'streaming response')),
      renderRetryBtn: jest.fn(() => null), isHistoryExpanded: false,
      handleExpandHistory: jest.fn(), modelConfig: { apiUrl: 'http://api.example.com' } });

    const { container } = render(result);
    expect(container.querySelector('[data-gc-part="message-list"]')).not.toBeNull();
    const streamingRow = container.querySelector('.streaming-message-row');
    expect(streamingRow).not.toBeNull();
    expect(streamingRow.querySelector('.chat-message.assistant')).toHaveStyle({ flex: '1', minWidth: '0' });
  });

  test('expanding history reveals earlier messages without losing the latest turn', () => {
    const options = { messages: [
      { role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'Latest question' }
    ], isLoading: false, tw: {},
    renderMarkdown: content => React.createElement('div', null, content),
    renderAssistantMsg: message => React.createElement('div', null, message.content),
    renderRetryBtn: () => null, modelConfig: {} };
    const view = render(MessageRenderers.renderMessages({ ...options, isHistoryExpanded: false }));
    expect(view.container.textContent).not.toContain('Earlier answer');
    expect(view.container.textContent).toContain('Latest question');
    view.rerender(MessageRenderers.renderMessages({ ...options, isHistoryExpanded: true }));
    expect(view.container.textContent).toContain('Earlier question');
    expect(view.container.textContent).toContain('Earlier answer');
    expect(view.container.textContent).toContain('Latest question');
  });
});
