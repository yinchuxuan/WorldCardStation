import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GameCardSwitcher from '../../../src/renderer/components/GameCardSwitcher.jsx';
import { capabilities } from '@platform';
jest.mock('@platform', () => ({ ...jest.requireActual('../../../src/web/platformPolicy.js').webPolicy,
  capabilities: { cardImport: false },
  rendererServices: { cards: {} } }));
afterEach(() => { capabilities.cardImport = false; });
const actions = () => ({ onActivate: jest.fn(), onImport: jest.fn(), onUninstall: jest.fn(), onError: jest.fn() });
test('shared selector shows hosted cover/version and resource removal, hides local import and update', async () => {
  const repository = { list: jest.fn().mockResolvedValue([{ id: 'one', name: '示例卡', cardVersion: '1.0',
    coverUrl: 'https://example.test/cover.png' }]) };
  render(<GameCardSwitcher {...actions()} repository={repository} />);
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  expect(await screen.findByText('示例卡')).toBeInTheDocument();
  expect(screen.getByText('1.0')).toBeInTheDocument();
  expect(screen.getByAltText('示例卡封面')).toHaveAttribute('src', 'https://example.test/cover.png');
  expect(screen.queryByRole('button', { name: /导入|更新/ })).toBeNull();
  expect(screen.getByRole('button', { name: '卸载 示例卡' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '普通聊天' })).toBeInTheDocument();
  expect(screen.queryByText(/选择游戏后下载完整资源/)).toBeNull();
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
test.each([false, true])('resource removal preserves saves independently of import availability (%s)', async canImport => {
  capabilities.cardImport = canImport;
  const props = actions();
  const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const repository = { list: jest.fn().mockResolvedValue([{ id: 'one', name: '示例卡' }]) };
  render(<GameCardSwitcher {...props} repository={repository} />);
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  const remove = await screen.findByRole('button', { name: '卸载 示例卡' });
  fireEvent.click(remove);
  expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/所有版本[\s\S]*存档会保留/));
  expect(props.onUninstall).not.toHaveBeenCalled();
  fireEvent.click(remove);
  await waitFor(() => expect(props.onUninstall).toHaveBeenCalledWith({ id: 'one', name: '示例卡' }));
  await waitFor(() => expect(repository.list).toHaveBeenCalledTimes(2));
  confirm.mockRestore();
});
