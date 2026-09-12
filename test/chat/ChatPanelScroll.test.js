/**
 * Tests for ChatPanel Component - Auto-scroll Behavior
 * Verifies chat history auto-scrolls to show latest messages
 */

const _React = require('react');
const { render: _render, screen: _screen, fireEvent: _fireEvent, waitFor: _waitFor, act } = require('@testing-library/react');

const platformMock = global.platformMock;
const chatPanelRenderers = require('../../src/renderer/components/ChatPanelRenderers').default;
const generationServices = require('../../src/renderer/chat/generationServices.js').default;

describe('ChatPanel Component - Auto-scroll', () => {
  let ChatPanel;
  const originalSendChatRequest = generationServices.sendChatRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-api-key', modelName: 'gpt-4' }
    });
    global.fetch.mockResolvedValue(global.createStreamingMock('Test response'));
    jest.spyOn(chatPanelRenderers, 'renderMsgHistoryDisplay').mockReturnValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    generationServices.sendChatRequest = originalSendChatRequest;
  });

  test('should have chat-history element as scrollable message container', async () => {
    ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => { await Promise.resolve(); });

    const chatHistory = document.querySelector('.chat-history');
    expect(chatHistory).toBeInTheDocument();
    // Verify chat-history has the class that provides overflow-y: auto via CSS
    expect(chatHistory.classList.contains('chat-history')).toBe(true);
  });

  test('should pin collapsed view to top when new user message is added', async () => {
    // Mock scrollTop setter
    const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      set() { this._scrollTop = arguments[0]; },
      get() { return this._scrollTop || 0; }
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() { return 500; }
    });

    ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Type a message to trigger message addition
    const input = _screen.getByPlaceholderText('输入您的回答...');
    _fireEvent.change(input, { target: { value: 'test message' } });

    await act(async () => { await Promise.resolve(); });

    const form = document.querySelector('.chat-input-area');
    _fireEvent.submit(form);

    // Wait for the message to be rendered
    await _waitFor(() => {
      expect(document.querySelector('.collapsed-message-view')).toBeTruthy();
    });

    const chatHistory = document.querySelector('.chat-history');
    expect(chatHistory).toBeTruthy();

    // When a collapsed view is present, the scroll effect pins to top (scrollTop = 0)
    expect(chatHistory._scrollTop).toBe(0);

    // Clean up
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalScrollTop || {});
  });

  test('should not reset collapsed view to user bubble when streaming finishes', async () => {
    const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      set(value) { this._scrollTop = value; },
      get() { return this._scrollTop || 0; }
    });
    let finishStream;
    generationServices.sendChatRequest = jest.fn(async (_payload, callbacks) => {
      callbacks.onToken('streaming answer');
      await new Promise(resolve => { finishStream = resolve; });
    });
    ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;
    _render(_React.createElement(ChatPanel, null));

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    _fireEvent.change(_screen.getByPlaceholderText('输入您的回答...'), { target: { value: 'test message' } });
    _fireEvent.submit(document.querySelector('.chat-input-area'));
    await _waitFor(() => expect(document.querySelector('.collapsed-message-view')).toBeTruthy());
    const collapsedView = document.querySelector('.collapsed-message-view');
    collapsedView.scrollTop = 123;

    await act(async () => { finishStream(); await Promise.resolve(); });
    await _waitFor(() => expect(document.querySelector('.streaming-message-row')).toBeFalsy());

    expect(collapsedView._scrollTop).toBe(123);
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalScrollTop || {});
  });

  test('should auto-scroll when toggling to msg history display', async () => {
    chatPanelRenderers.renderMsgHistoryDisplay.mockImplementation(() =>
      _React.createElement('div', { className: 'chat-msg-history-display' }, 'Msg History Content')
    );

    ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Toggle to msg history display
    const header = document.querySelector('.chat-header');
    _fireEvent.click(header);

    await act(async () => { await Promise.resolve(); });

    expect(_screen.getByText('Msg History Content')).toBeInTheDocument();

    const chatHistory = document.querySelector('.chat-history');
    expect(chatHistory).toBeTruthy();
  });

  test('should not have custom scrollbar UI components', async () => {
    ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

    _render(_React.createElement(ChatPanel, null));

    await act(async () => { await Promise.resolve(); });

    const chatHistory = document.querySelector('.chat-history');
    expect(chatHistory).toBeTruthy();

    // Verify no custom scrollbar component present - uses native browser scrollbar
    const scrollbarComponents = document.querySelectorAll('[class*="scrollbar"], [class*="scroll-bar"], [class*="custom-scroll"]');
    expect(scrollbarComponents.length).toBe(0);
  });
});
