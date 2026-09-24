import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';

test('renders import errors outside the auto-hidden header', async () => {
  global.platformMock.getActiveGameCard.mockResolvedValue({ success: true, card: null });
  global.platformMock.getChatHistory.mockResolvedValue({ success: true, messages: [] });
  global.platformMock.getModelConfig.mockResolvedValue({ success: true, config: {} });
  global.platformMock.importGameCardFromFile.mockResolvedValue({ success: false,
    error: '游戏卡主文件 schema 校验失败', stage: 'validate_card', file: 'card.json',
    details: [{ file: 'card.json', message: 'rules[0].then: must be a non-empty array' }] });
  render(<ChatPanel />);
  await screen.findByText('开始对话', {}, { timeout: 5000 });
  await waitFor(() => expect(screen.getByRole('button', { name: '切换游戏卡' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导入游戏卡文件' })); });
  const panel = document.querySelector('.chat-main > .game-card-error-panel.import');
  expect(panel).toHaveTextContent('导入游戏卡失败');
  expect(panel).toHaveTextContent('rules[0].then: must be a non-empty array');
  fireEvent.click(screen.getByRole('button', { name: '关闭导入错误' }));
  expect(document.querySelector('.chat-main > .game-card-error-panel.import')).toBeNull();
});
