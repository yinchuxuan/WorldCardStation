import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

import '../../src/renderer/components/ChatSessionManager.jsx';
import GameCardTitleControl from '../../src/renderer/components/GameCardTitleControl.jsx';
import { GameCardRuntimeProvider } from '../../src/renderer/chat/GameCardRuntimeProvider.jsx';
import { rendererServices } from '../../src/renderer/platform/index.js';

const platformMock = global.platformMock;

function renderControl(props = {}, parentProps = null) {
  const callbacks = {
    onActivateCard: jest.fn(async () => null),
    onImportCard: () => rendererServices.cards.importFile(),
    onUninstallCard: card => rendererServices.cards.uninstall(card.id)
  };
  const control = <GameCardRuntimeProvider mainSession={{}}>
    <GameCardTitleControl {...callbacks} {...props} />
  </GameCardRuntimeProvider>;
  return render(parentProps ? <div {...parentProps}>{control}</div> : control);
}

async function openSwitcher() {
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  await screen.findByText('切换游戏卡');
}

describe('GameCardTitleControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.getActiveGameCard.mockResolvedValue({ success: true, card: null });
    platformMock.getGameCards.mockResolvedValue({ success: true, cards: [] });
    platformMock.importGameCardFromFile.mockResolvedValue({ success: false, canceled: true, card: null });
    platformMock.listChatSessions.mockResolvedValue({
      success: true,
      activeId: 'default',
      sessions: [{ id: 'default', title: '默认会话', preview: '开场', messageCount: 1 }]
    });
    platformMock.createChatSession.mockResolvedValue({ success: true, id: 'session-1' });
    platformMock.setActiveChatSession.mockResolvedValue({ success: true, id: 'session-1' });
  });

  test('shows current active game card', async () => {
    platformMock.getActiveGameCard.mockResolvedValue({
      success: true,
      card: { id: 'quest', name: 'Quest Card', rules: [] }
    });

    renderControl();

    await screen.findByText('Quest Card');
  });

  test('shows normal chat when no game card is active', async () => {
    renderControl();

    await screen.findByText('普通聊天');
  });

  test('starts game card import and stops header click propagation', async () => {
    const headerClick = jest.fn();
    const importedCard = { id: 'new_quest', name: 'New Quest', rules: [] };
    platformMock.importGameCardFromFile.mockResolvedValue({
      success: true,
      card: importedCard
    });
    renderControl({}, { onClick: headerClick });

    await screen.findByText('普通聊天');
    await openSwitcher();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '导入游戏卡文件' }));
    });

    expect(platformMock.importGameCardFromFile).toHaveBeenCalled();
    expect(headerClick).not.toHaveBeenCalled();
  });

  test('disables game card switching during generation', async () => {
    renderControl({ isLoading: true });
    await screen.findByText('普通聊天');

    const button = screen.getByRole('button', { name: '切换游戏卡' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', '生成完成后可切换游戏卡');
    fireEvent.click(button);
    expect(screen.queryByText('切换游戏卡')).not.toBeInTheDocument();
    expect(platformMock.importGameCardFromFile).not.toHaveBeenCalled();
  });

  test('shows readable import errors without changing active card', async () => {
    platformMock.importGameCardFromFile.mockResolvedValue({
      success: false,
      error: '游戏卡状态 schema 校验失败',
      stage: 'validate_state_schema',
      file: 'state/schema.json',
      details: [{ file: 'state/schema.json', message: 'schema.timeline.currentTime.default: must be a string' }]
    });
    renderControl();
    await screen.findByText('普通聊天');
    await openSwitcher();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '导入游戏卡文件' }));
    });

    expect(screen.getByText('导入游戏卡失败')).toBeInTheDocument();
    expect(screen.getByText('游戏卡状态 schema 校验失败')).toBeInTheDocument();
    expect(screen.getByText('阶段: 状态 schema 校验')).toBeInTheDocument();
    expect(screen.getAllByText(/state\/schema\.json/).length).toBeGreaterThan(0);
    expect(screen.getByText(/schema\.timeline\.currentTime\.default/)).toBeInTheDocument();
  });

  test('opens session manager without showing session name in title', async () => {
    renderControl();

    await screen.findByText('普通聊天');
    const sessionButton = screen.getByRole('button', { name: '管理聊天会话' });
    expect(sessionButton.querySelector('.material-icons')).toHaveTextContent('inventory_2');
    await act(async () => {
      fireEvent.click(sessionButton);
    });

    expect(document.querySelector('.chat-session-panel-title')).toHaveTextContent('会话');
    expect(document.querySelector('[data-gc-part="chat-session-panel"]')).toHaveAttribute('data-state', 'open');
    expect(sessionButton).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('[data-gc-part="chat-session-manager"]')).toBeTruthy();
    expect(document.querySelector('[data-gc-part="chat-session-row"]')).toBeTruthy();
    expect(screen.getByText('默认会话')).toBeInTheDocument();
    expect(screen.getByText('普通聊天')).toBeInTheDocument();
    fireEvent.click(sessionButton);
    expect(document.querySelector('[data-gc-part="chat-session-panel"]')).toHaveAttribute('data-state', 'closing');
    expect(sessionButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('renders audio control in the title bar', async () => {
    renderControl({ audioControl: <button className="audio-test" aria-label="关闭 BGM">music_note</button> });

    await screen.findByText('普通聊天');
    const actions = document.querySelector('.game-card-title-actions');
    expect(document.querySelector('[data-gc-part="game-card-title"]')).toBeTruthy();
    expect(actions.dataset.gcPart).toBe('game-card-title-actions');
    expect(actions).toContainElement(screen.getByRole('button', { name: '关闭 BGM' }));
    expect(actions.children[0]).toContainElement(screen.getByRole('button', { name: '关闭 BGM' }));
    expect(actions.children[1].querySelector('.chat-session-btn')).not.toBeNull();
  });

  test('creates and switches sessions through callbacks', async () => {
    const before = jest.fn();
    const changed = jest.fn();
    platformMock.listChatSessions
      .mockResolvedValueOnce({ success: true, activeId: 'default', sessions: [{ id: 'default', title: '默认会话' }] })
      .mockResolvedValue({ success: true, activeId: 'session-1', sessions: [{ id: 'session-1', title: '新会话' }] });

    renderControl({ onBeforeSessionChange: before, onSessionChanged: changed });
    await screen.findByText('普通聊天');
    fireEvent.click(screen.getByRole('button', { name: '管理聊天会话' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    });

    await waitFor(() => expect(platformMock.createChatSession).toHaveBeenCalledWith('新会话'));
    expect(before).toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith('session-1');
  });

  test('saves current session from session manager', async () => {
    const before = jest.fn();
    platformMock.getChatHistory.mockResolvedValue({
      success: true,
      messages: [{ role: 'user', content: 'snapshot' }],
      gameState: { timeline: { currentTime: '10:30' } },
      retryBaseMessages: [{ role: 'user', content: 'base' }],
      retryBaseState: { timeline: { currentTime: '10:00' } },
      viewState: { reading: { messageId: 'reply', segmentIndex: 4 } }
    });
    platformMock.createChatSession.mockResolvedValue({ success: true, id: 'archive-1' });

    renderControl({ onBeforeSessionChange: before });
    await screen.findByText('普通聊天');
    fireEvent.click(screen.getByRole('button', { name: '管理聊天会话' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存当前会话' }));
    });

    expect(before).toHaveBeenCalledTimes(1);
    expect(platformMock.createChatSession).toHaveBeenCalledWith('会话存档');
    expect(platformMock.saveChatHistory).toHaveBeenCalledWith([{ role: 'user', content: 'snapshot' }], {
      gameState: { timeline: { currentTime: '10:30' } },
      retryBaseMessages: [{ role: 'user', content: 'base' }],
      retryBaseState: { timeline: { currentTime: '10:00' } },
      viewState: { reading: { messageId: 'reply', segmentIndex: 4 } }
    });
    expect(platformMock.setActiveChatSession).toHaveBeenCalledWith('default');
  });
});
