const { act, render, renderHook } = require('@testing-library/react');
const DOMPurify = require('dompurify')(window);
const { marked } = require('marked');
const renderers = require('../../src/renderer/components/ChatPanelMessageRenderers').default;
const {
  isSegmentAdvanceEvent,
  resolveReadingSegments,
  splitReadingSegments
} = require('../../src/renderer/chat/useSegmentedReading');
const useSegmentedReading = require('../../src/renderer/chat/useSegmentedReading').default;

function renderSegmented(content, pageIndex, display, thinkingToggle = jest.fn()) {
  return render(renderers.renderAssistantMsg({ msg: { role: 'assistant', content, _thinking: 'reasoning' }, idx: 0, isStreaming: false, tw: null,
      currentThinking: '', showStreamThinking: false, setShowStreamThinking: jest.fn(),
      toggleThinkingForMessage: thinkingToggle, marked, DOMPurify, highlightQuotes: value => value, display,
      displayRevision: JSON.stringify(display || null), segmentedReading: { enabled: true, pageIndex } }));
}

function clickEvent(overrides = {}) {
  const currentTarget = {
    ownerDocument: {
      defaultView: { getSelection: () => ({ isCollapsed: true }) }
    }
  };
  return {
    button: 0,
    currentTarget,
    defaultPrevented: false,
    target: { closest: () => null },
    type: 'click',
    ...overrides
  };
}

describe('segmented reading', () => {
  afterEach(() => jest.useRealTimers());

  test('splits only on blank paragraph lines and normalizes line endings', () => {
    expect(splitReadingSegments('第一行\n仍是第一段\r\n\r\n第二段\n\n\n第三段')).toEqual([
      '第一行\n仍是第一段',
      '第二段',
      '第三段'
    ]);
  });

  test('uses the game card literal separator after normalizing line endings', () => {
    expect(splitReadingSegments('第一行\r\n第二行\n\n第三行', '\r\n')).toEqual(['第一行', '第二行', '第三行']);
    expect(resolveReadingSegments('甲<page>乙<page><page>丙', { segmentSeparator: '<page>' })).toEqual(['甲', '乙', '丙']);
  });

  test('shows one paragraph and exposes its page count to the reading surface', () => {
    const toggleThinking = jest.fn();
    const { container } = renderSegmented('第一段。\n\n第二段。', 0, undefined, toggleThinking);
    const bubble = container.querySelector('.segmented-reading-bubble');

    expect(container.textContent).toContain('第一段。');
    expect(container.textContent).not.toContain('第二段。');
    expect(container.textContent).not.toContain('reasoning');
    expect(container.querySelector('[data-gc-part="message-thinking"]')).toBeNull();
    expect(bubble).toHaveAttribute('data-segment-count', '2');
    expect(toggleThinking).not.toHaveBeenCalled();
  });

  test('applies display rules before paragraph splitting', () => {
    const display = {
      assistant: [{
        id: 'hide-patch',
        stage: 'before_markdown',
        type: 'regex_replace',
        pattern: '<state_patch>[\\s\\S]*?<\\/state_patch>',
        flags: 'g',
        replace: ''
      }]
    };
    const content = '<state_patch>\\n[]\\n</state_patch>\n\n正文第一段。\n\n正文第二段。';
    const { container } = renderSegmented(content, 0, display);

    expect(container.textContent).toContain('正文第一段。');
    expect(container.textContent).not.toContain('state_patch');
    expect(container.textContent).not.toContain('正文第二段。');
  });

  test('does not advance from interactive children or selected text', () => {
    const interactive = document.createElement('a');
    const currentTarget = document.createElement('div');
    currentTarget.appendChild(interactive);
    expect(isSegmentAdvanceEvent(clickEvent({
      currentTarget,
      target: interactive
    }))).toBe(false);
    expect(isSegmentAdvanceEvent(clickEvent({
      currentTarget: {
        ownerDocument: {
          defaultView: { getSelection: () => ({ isCollapsed: false }) }
        }
      }
    }))).toBe(false);
    const header = document.createElement('div');
    header.setAttribute('data-gc-part', 'chat-header');
    currentTarget.appendChild(header);
    expect(isSegmentAdvanceEvent(clickEvent({
      currentTarget,
      target: header
    }))).toBe(false);
  });

  test('moves continuously between segments and assistant messages', () => {
    jest.useFakeTimers();
    const messages = [
      { id: 'old', role: 'assistant', content: '旧第一段。\n\n旧第二段。' },
      { role: 'user', content: '继续' },
      { id: 'latest', role: 'assistant', content: '新第一段。\n\n新第二段。' }
    ];
    const { result } = renderHook(props => useSegmentedReading(props), {
      initialProps: {
        enabled: true,
        isLoading: false,
        messages,
        scopeKey: 1
      }
    });

    expect(result.current.messageIndex).toBe(2);
    expect(result.current.pageIndex).toBe(0);
    act(() => result.current.navigate('reading.previous'));
    expect(result.current.messageIndex).toBe(0);
    expect(result.current.pageIndex).toBe(1);
    act(() => jest.runAllTimers());
    act(() => result.current.navigate('reading.previous'));
    expect(result.current.pageIndex).toBe(0);
    act(() => jest.runAllTimers());
    act(() => result.current.navigate('reading.next'));
    expect(result.current.pageIndex).toBe(1);
    act(() => jest.runAllTimers());
    act(() => result.current.navigate('reading.next'));
    expect(result.current.messageIndex).toBe(2);
    expect(result.current.pageIndex).toBe(0);
    act(() => jest.runAllTimers());
    act(() => result.current.navigate('reading.previous'));
    act(() => jest.runAllTimers());
    act(() => result.current.navigate('reading.latest'));
    expect(result.current.messageIndex).toBe(2);
    expect(result.current.pageIndex).toBe(1);
    expect(result.current.ui.atLatest).toBe(true);
  });

  test('keeps the current page when streaming becomes a completed message', () => {
    jest.useFakeTimers();
    const content = '第一段。\n\n第二段。\n\n第三段。';
    const { result, rerender } = renderHook(props => useSegmentedReading(props), {
      initialProps: {
        enabled: true,
        isLoading: true,
        messages: [{ role: 'user', content: '继续' }],
        streamContent: content,
        displayedCount: content.length,
        scopeKey: 1
      }
    });

    act(() => result.current.navigate('reading.next'));
    expect(result.current.pageIndex).toBe(1);
    rerender({
      enabled: true,
      isLoading: false,
      messages: [
        { role: 'user', content: '继续' },
        { id: 'completed', role: 'assistant', content }
      ],
      streamContent: content,
      displayedCount: content.length,
      scopeKey: 1
    });
    expect(result.current.pageIndex).toBe(1);
  });

  test('removes input action pages from historical reading', () => {
    const content = [
      '剧情正文。',
      '',
      '<button data-gc-chat-input-value="A. 继续">继续</button>'
    ].join('\n');
    expect(resolveReadingSegments(content, undefined)).toHaveLength(2);
    expect(resolveReadingSegments(content, undefined, false)).toEqual(['剧情正文。']);
  });
});
