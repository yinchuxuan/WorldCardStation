const React = require('react');
const { act, fireEvent, render, screen, waitFor } = require('@testing-library/react');
const { GameCardRuntimeProvider } = require('../../src/renderer/chat/GameCardRuntimeProvider.jsx');
const ChatRuntime = require('../../src/renderer/chat/ChatRuntime.jsx').default;

const messages = [
  { id: 'old', role: 'assistant', content: '旧回复。' },
  { id: 'user', role: 'user', content: '继续。' },
  { id: 'latest', role: 'assistant', content: '最新回复。' }
];

async function renderHistory(segmentedReading) {
  global.platformMock.getActiveGameCard.mockResolvedValue({ success: true, card: null });
  global.platformMock.getChatHistory.mockResolvedValue({ success: true, messages, gameState: {} });
  if (segmentedReading) {
    global.platformMock.getActiveGameCard.mockResolvedValue({ success: true, card: { id: 'segmented', display: { segmentedReading: true } } });
    const records = messages.filter(msg => msg.role === 'assistant').map(msg => ({ ...msg,
      mode: 'segmented', units: [{ text: msg.content, patches: [] }] }));
    const view = { state: {}, contexts: {}, records, messages, reading: null };
    const session = { view: () => view, snapshot: () => view, subscribe: () => () => {},
      dispose: jest.fn(), cancel: jest.fn(), advance: jest.fn(), running: false };
    const result = render(<GameCardRuntimeProvider mainSession={session}><ChatRuntime /></GameCardRuntimeProvider>);
    await screen.findByText('最新回复。');
    await waitFor(() => expect(result.container.querySelector('.collapsed-message-view')).toBeNull());
    return result.container.querySelector('[data-gc-part="message-surface"]');
  }
  const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;
  const result = render(React.createElement(ChatPanel));
  await screen.findByText('最新回复。', {}, { timeout: 5000 });
  return result.container.querySelector('.collapsed-message-view');
}

function pullUp(view) {
  for (let index = 0; index < 5; index += 1) {
    fireEvent.wheel(view, { deltaY: -100 });
  }
  act(() => jest.advanceTimersByTime(100));
}

describe('segmented reading history expansion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.platformMock.getModelConfig.mockResolvedValue({ success: true, config: {} });
  });

  afterEach(() => jest.useRealTimers());

  test('ignores the collapsed-history gesture in segmented reading mode', async () => {
    const view = await renderHistory(true);
    jest.useFakeTimers();
    pullUp(view);

    expect(view).not.toHaveClass('expanded');
    expect(screen.queryByText('旧回复。')).toBeNull();
  });

  test('keeps the collapsed-history gesture in normal mode', async () => {
    const view = await renderHistory(false);
    jest.useFakeTimers();
    pullUp(view);

    expect(view).toHaveClass('expanded');
    expect(screen.getByText('旧回复。')).toBeInTheDocument();
  });
});
