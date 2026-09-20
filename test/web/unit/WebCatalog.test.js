import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GameCardSwitcher from '../../../src/renderer/components/GameCardSwitcher.jsx';
jest.mock('@platform', () => ({ capabilities: { cardImport: false }, rendererServices: { cards: {} } }));
const actions = () => ({ onActivate: jest.fn(), onImport: jest.fn(), onUninstall: jest.fn(), onError: jest.fn() });
test('shared selector shows hosted cover/version and hides local import, update and uninstall', async () => {
  const repository = { list: jest.fn().mockResolvedValue([{ id: 'one', name: '示例卡', cardVersion: '1.0',
    coverUrl: 'https://example.test/cover.png' }]) };
  render(<GameCardSwitcher {...actions()} repository={repository} />);
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  expect(await screen.findByText('示例卡')).toBeInTheDocument();
  expect(screen.getByText('1.0')).toBeInTheDocument();
  expect(screen.getByAltText('示例卡封面')).toHaveAttribute('src', 'https://example.test/cover.png');
  expect(screen.queryByRole('button', { name: /导入|卸载|更新/ })).toBeNull();
  expect(screen.getByRole('button', { name: '普通聊天' })).toBeInTheDocument();
});
test('catalog load error is reported; reopening retries the actual repository', async () => {
  const props = actions();
  const repository = { list: jest.fn().mockRejectedValueOnce(new Error('目录不可用')).mockResolvedValue([]) };
  render(<GameCardSwitcher {...props} repository={repository} />);
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  await waitFor(() => expect(props.onError).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  await waitFor(() => expect(repository.list).toHaveBeenCalledTimes(2));
});
