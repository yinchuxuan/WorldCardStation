const React = require('react');
const { act, fireEvent, render, screen, waitFor } = require('@testing-library/react');
const {
  SEGMENT_TRANSITION_MS
} = require('../../src/renderer/chat/useSegmentedReading');
const readingRootSource = `
  function Root({ React, emit }) {
    return React.createElement('nav', null,
      React.createElement('button', { onClick: () => emit({ type: 'reading.previous' }) }, '上一页'),
      React.createElement('button', { onClick: () => emit({ type: 'reading.next' }) }, '下一页')
    );
  }
`;

function activeCard(display, ui) {
  return {
    success: true,
    card: {
      version: '1',
      id: 'segmented-card',
      name: 'Segmented Card',
      display,
      ui,
      rules: []
    }
  };
}

function streamingMock(content = '第一段。\n\n第二段。\n\n第三段。') {
  const payload = JSON.stringify({
    choices: [{ delta: { content } }]
  });
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });
  return {
    ok: true,
    body: { getReader: () => stream.getReader() }
  };
}

async function sendMessage() {
  const input = screen.getByPlaceholderText('输入您的回答...');
  fireEvent.change(input, { target: { value: '继续' } });
  fireEvent.submit(input.closest('form'));
  await waitFor(() => expect(screen.getByText('第一段。')).toBeInTheDocument());
}

describe('game card segmented reading config', () => {
  afterEach(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    global.platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com', apiKey: 'key', modelName: 'model' }
    });
    global.platformMock.getChatHistory.mockResolvedValue({ success: true, messages: [] });
    global.fetch.mockResolvedValue(streamingMock());
  });

  test('advances from the full chat surface click and Enter key', async () => {
    global.platformMock.getActiveGameCard.mockResolvedValue(activeCard({ segmentedReading: true }));
    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;
    const { container } = render(React.createElement(ChatPanel));
    await screen.findByText('Segmented Card');

    await sendMessage();

    expect(screen.queryByText('第二段。')).toBeNull();
    jest.useFakeTimers();
    fireEvent.click(container.querySelector('[data-gc-part="chat-panel"]'));
    expect(screen.getByText('第二段。')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(SEGMENT_TRANSITION_MS));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('第三段。')).toBeInTheDocument();
  });

  test('keeps input choices visible until the selected input is sent', async () => {
    const choices = ['去音乐室。', '前往天台。', '留在教室。', '独自回家。'];
    const buttons = choices.map((choice, index) => (
      `<button class="input-choice" data-gc-chat-input-value="${String.fromCharCode(65 + index)}. ${choice}"><span>${choice}</span></button>`
    )).join('');
    const choiceReply = `第一段。\n\n<div class="choice-overlay"><p>请选择下一步行动</p>${buttons}</div>`;
    global.platformMock.getActiveGameCard.mockResolvedValue(activeCard({ segmentedReading: true }));
    global.fetch
      .mockResolvedValueOnce(streamingMock(choiceReply))
      .mockResolvedValueOnce(streamingMock('下一轮正文。'));
    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;
    const { container } = render(React.createElement(ChatPanel));
    await screen.findByText('Segmented Card');

    await sendMessage();
    fireEvent.click(container.querySelector('[data-gc-part="chat-panel"]'));

    expect(screen.getByText('请选择下一步行动')).toBeInTheDocument();
    expect(container.querySelector('.choice-overlay')).not.toBeNull();
    expect(container.querySelectorAll('.input-choice')).toHaveLength(4);

    const choice = screen.getByText('前往天台。');
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    choice.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    fireEvent.click(choice);
    const input = screen.getByPlaceholderText('输入您的回答...');
    expect(input).toHaveValue('B. 前往天台。');
    expect(input).toHaveFocus();
    expect(container.querySelector('.choice-overlay')).not.toBeNull();

    act(() => choice.closest('button').focus());
    fireEvent.keyDown(choice.closest('button'), { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(container.querySelector('.choice-overlay')).toBeNull());
    await screen.findByText('下一轮正文。');
  });

  test('lets card UI navigate between current and historical reading pages', async () => {
    const messages = [
      {
        id: 'old-reply',
        role: 'assistant',
        content: [
          '旧第一段。',
          '',
          '旧第二段。',
          '',
          '<button data-gc-chat-input-value="A. 旧选项">旧选项</button>'
        ].join('\n')
      },
      { role: 'user', content: '继续当前剧情。' },
      { id: 'latest-reply', role: 'assistant', content: '新第一段。\n\n新第二段。' }
    ];
    global.platformMock.getChatHistory.mockResolvedValue({
      success: true,
      messages,
      gameState: {}
    });
    global.platformMock.getActiveGameCard.mockResolvedValue(activeCard(
      { segmentedReading: true },
      { root: { type: 'react', source: 'ui/root.js' } }
    ));
    global.platformMock.readGameCardFile.mockResolvedValue({
      success: true,
      content: readingRootSource
    });
    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;
    render(React.createElement(ChatPanel));

    await screen.findByText('新第一段。');
    const previous = await screen.findByRole('button', { name: '上一页' });
    jest.useFakeTimers();
    fireEvent.click(previous);

    expect(screen.getByText('旧第二段。')).toBeInTheDocument();
    expect(screen.queryByText('旧选项')).toBeNull();
    expect(screen.queryByText('新第一段。')).toBeNull();

    act(() => jest.advanceTimersByTime(SEGMENT_TRANSITION_MS));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('新第一段。')).toBeInTheDocument();
  });

  test('keeps normal full display when the card does not enable it', async () => {
    global.platformMock.getActiveGameCard.mockResolvedValue(activeCard({}));
    const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;
    render(React.createElement(ChatPanel));
    await screen.findByText('Segmented Card');

    await sendMessage();

    expect(screen.getByText('第二段。')).toBeInTheDocument();
    expect(screen.getByText('第三段。')).toBeInTheDocument();
    expect(document.querySelector('.segmented-reading-bubble')).toBeNull();
  });
});
