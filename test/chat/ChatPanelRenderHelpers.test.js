const React = require('react');
const { render } = require('@testing-library/react');
const ChatPanelRenderers = require('../../src/renderer/components/ChatPanelRenderers').default;
const MessageRenderers = require('../../src/renderer/components/ChatPanelMessageRenderers').default;

describe('MsgHistoryDisplay Card', () => {
  test('renders empty state when messages are absent', () => {
    const result = ChatPanelRenderers.renderMsgHistoryDisplay(null);
    expect(result.props.className).toBe('chat-empty');
    expect(result.props.children[0].props.children).toBe('inbox');
    expect(result.props.children[1].props.children).toBe('暂无消息历史记录');
  });

  test('renders empty state for an empty message array', () => {
    const result = ChatPanelRenderers.renderMsgHistoryDisplay([]);
    expect(result.props.className).toBe('chat-empty');
    expect(result.props.children[0].props.children).toBe('inbox');
    expect(result.props.children[1].props.children).toBe('暂无消息历史记录');
  });

  test('renders a rectangular card with indexed message JSON', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ];
    const result = ChatPanelRenderers.renderMsgHistoryDisplay(messages);
    const pre = result.props.children;
    const parsed = JSON.parse(pre.props.children);

    expect(result.props.className).toBe('msg-history-card');
    expect(result.props['data-gc-part']).toBe('message-history');
    expect(pre.type).toBe('pre');
    expect(pre.props.className).toBe('msg-history-json');
    expect(pre.props['data-gc-part']).toBe('message-history-content');
    expect(parsed.msgs['0']).toEqual(messages[0]);
    expect(parsed.msgs['1']).toEqual(messages[1]);
  });

  test('includes all messages in the JSON structure', () => {
    const messages = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' }
    ];
    const result = ChatPanelRenderers.renderMsgHistoryDisplay(messages);
    const parsed = JSON.parse(result.props.children.props.children);

    expect(Object.keys(parsed.msgs)).toHaveLength(4);
    expect(parsed.msgs['3'].content).toBe('Response 2');
  });

  test('uses numeric index keys in message JSON', () => {
    const result = ChatPanelRenderers.renderMsgHistoryDisplay([
      { role: 'user', content: 'Test' }
    ]);
    const parsed = JSON.parse(result.props.children.props.children);

    expect(parsed.msgs).toHaveProperty('0');
    expect(typeof parsed.msgs['0'].role).toBe('string');
    expect(typeof parsed.msgs['0'].content).toBe('string');
  });
});

describe('ChatPanelMessageRenderers streaming layout', () => {
  test('wraps streaming assistant output in a message row', () => {
    const result = MessageRenderers.renderMessages({ messages: [{ role: 'user', content: 'Question' }], isLoading: true,
      tw: { streamContent: 'streaming response', displayedCount: 18 },
      renderMarkdown: jest.fn(content => React.createElement('div', null, content)),
      renderAssistantMsg: jest.fn(() => React.createElement('div', null, 'streaming response')),
      renderRetryBtn: jest.fn(() => null), collapseRenderer: null, isHistoryExpanded: false,
      handleExpandHistory: jest.fn(), modelConfig: { apiUrl: 'http://api.example.com' } });

    const { container } = render(result);
    expect(container.querySelector('[data-gc-part="message-surface"]')).not.toBeNull();
    const streamingRow = container.querySelector('.streaming-message-row');
    expect(streamingRow).not.toBeNull();
    expect(streamingRow.querySelector('.chat-message.assistant')).toHaveStyle({ flex: '1', minWidth: '0' });
  });

  test('uses collapse renderer while loading', () => {
    const collapseRenderer = {
      render: jest.fn(() => React.createElement('div', { className: 'collapsed-message-view' }))
    };
    const result = MessageRenderers.renderMessages({ messages: [{ role: 'user', content: 'Question' }], isLoading: true,
      tw: { streamContent: 'response', displayedCount: 8 }, renderMarkdown: jest.fn(),
      renderAssistantMsg: jest.fn(), renderRetryBtn: jest.fn(), collapseRenderer, isHistoryExpanded: false,
      handleExpandHistory: jest.fn(), modelConfig: { apiUrl: 'http://api.example.com' } });

    expect(collapseRenderer.render).toHaveBeenCalled();
    expect(result.props.className).toBe('collapsed-message-view');
  });
});
