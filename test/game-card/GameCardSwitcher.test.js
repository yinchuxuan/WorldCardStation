import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameCardSwitcher from '../../src/renderer/components/GameCardSwitcher.jsx';

describe('GameCardSwitcher', () => {
  test('lists normal chat and imported game cards', async () => {
    const activeCard = { id: 'quest', name: 'Quest Card' };
    const otherCard = { id: 'other', name: 'Other Card' };
    const onActivate = jest.fn(async () => null);
    const repository = { list: jest.fn(async () => [activeCard, otherCard]) };

    render(<GameCardSwitcher activeCard={activeCard} repository={repository}
      onActivate={onActivate} onImport={jest.fn()} onUninstall={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));

    expect(await screen.findByText('Other Card')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '普通聊天' }));
    });

    expect(onActivate).toHaveBeenCalledWith(null);
  });

  test('shows import progress and the imported card name on success', async () => {
    let finishImport;
    const imported = { id: 'new-card', name: 'New Card' };
    const onImport = jest.fn(() => new Promise(resolve => { finishImport = resolve; }));
    const repository = { list: jest.fn(async () => [imported]) };
    render(<GameCardSwitcher repository={repository} onActivate={jest.fn()}
      onImport={onImport} onUninstall={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
    const importButton = await screen.findByRole('button', { name: '导入游戏卡文件' });
    expect(importButton).toHaveAttribute('title', expect.stringContaining('card.json'));
    expect(screen.queryByRole('group', { name: '导入来源' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导入游戏卡文件夹' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '导入游戏卡文件' }));

    expect(screen.getByText('正在导入游戏卡…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '游戏卡导入进度' })).toBeInTheDocument();
    await act(async () => { finishImport(imported); });

    expect(await screen.findByText('导入成功：New Card')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('keeps the panel open and reports a failed import', async () => {
    const onError = jest.fn();
    const error = new Error('invalid card');
    const repository = { list: jest.fn(async () => []) };
    render(<GameCardSwitcher repository={repository} onActivate={jest.fn()}
      onImport={jest.fn(async () => { throw error; })} onUninstall={jest.fn()} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
    fireEvent.click(await screen.findByRole('button', { name: '导入游戏卡文件' }));

    expect(await screen.findByText('导入失败，请查看错误详情')).toBeInTheDocument();
    expect(screen.getByText('切换游戏卡')).toBeInTheDocument();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      title: '导入游戏卡失败', message: 'invalid card'
    })));
  });

  test('canceling the file picker restores the single import button without an error', async () => {
    const onError = jest.fn();
    render(<GameCardSwitcher repository={{ list: jest.fn(async () => []) }} onActivate={jest.fn()}
      onImport={jest.fn(async () => { throw Object.assign(new Error('canceled'), { canceled: true }); })}
      onUninstall={jest.fn()} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
    const button = await screen.findByRole('button', { name: '导入游戏卡文件' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onError.mock.calls.every(([error]) => error === null)).toBe(true);
  });

  test('confirms and uninstalls a game card with all of its saves', async () => {
    const card = { id: 'quest', name: 'Quest Card' };
    const repository = { list: jest.fn()
      .mockResolvedValueOnce([card]).mockResolvedValueOnce([]) };
    const onUninstall = jest.fn(async () => null);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GameCardSwitcher repository={repository} onActivate={jest.fn()}
      onImport={jest.fn()} onUninstall={onUninstall} />);
    fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
    fireEvent.click(await screen.findByRole('button', { name: '卸载 Quest Card' }));

    await waitFor(() => expect(onUninstall).toHaveBeenCalledWith(card));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('全部存档'));
    await waitFor(() => expect(screen.queryByText('Quest Card')).not.toBeInTheDocument());
    confirm.mockRestore();
  });
});
