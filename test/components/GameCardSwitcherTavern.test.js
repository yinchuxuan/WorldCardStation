import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameCardSwitcher from '../../src/renderer/components/GameCardSwitcher.jsx';
import useGameCardSwitching from '../../src/renderer/chat/useGameCardSwitching.js';
import { compileTavern } from '../../src/renderer/gameCard/compileTavern.js';
import { convertTavernCard } from '../../src/shared/tavern-import/convert.js';
import { source } from '../tavern-import/runtime.js';

jest.mock('../../src/renderer/gameCard/compileTavern.js', () => ({ compileTavern: jest.fn() }));
beforeEach(() => compileTavern.mockImplementation(async input => convertTavernCard(input)));

function setup(data = {}) {
  const card = { id: 'new', name: 'Alice' };
  const old = { id: 'old', name: '旧卡' };
  const repository = { list: jest.fn(async () => [old]),
    importFile: jest.fn(async () => ({ kind: 'tavern', token: 'task', id: 'new', source: source(data) })),
    stageTavernImport: jest.fn(async () => ({ revision: 'ready' })),
    commitTavernImport: jest.fn(async () => card), cancelTavernImport: jest.fn(async () => {}) };
  const runtime = { setRuntimeError: jest.fn(), changeActiveCard: jest.fn() };
  const session = { saveCurrent: jest.fn(async () => {}), reload: jest.fn(async () => {}) };
  const presentation = { stopBgm: jest.fn(), updateAll: jest.fn() };
  const onError = jest.fn();
  function Harness() {
    const switching = useGameCardSwitching({ repository, runtime, session, presentation });
    return <GameCardSwitcher repository={repository} onImport={switching.importCard}
      onActivate={switching.activate} onUninstall={switching.uninstallCard} onError={onError} />;
  }
  const view = render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  return { ...view, repository, runtime, onError };
}

test('the single import button installs a compatible card without a dialog and shows success', async () => {
  const context = setup();
  fireEvent.click(screen.getByRole('button', { name: '导入游戏卡文件' }));
  await screen.findByText('导入成功：Alice');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('转换选项')).not.toBeInTheDocument();
  expect(context.repository.commitTavernImport).toHaveBeenCalledWith('task', 'ready');
});

test('lossy imports support cancel and then continue without a checkbox', async () => {
  const context = setup({ first_mes: '{{unknown}}' });
  const trigger = screen.getByRole('button', { name: '导入游戏卡文件' });
  fireEvent.click(trigger);
  await screen.findByRole('dialog', { name: '酒馆卡兼容差异' });
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(trigger).toBeEnabled());
  expect(context.repository.cancelTavernImport).toHaveBeenCalledWith('task');
  expect(context.runtime.changeActiveCard).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('button', { name: '继续导入' }));
  await screen.findByText('导入成功：Alice');
  expect(context.repository.commitTavernImport).toHaveBeenCalledTimes(1);
});

test('updating from the card row requires an independent overwrite confirmation', async () => {
  const context = setup();
  fireEvent.click(await screen.findByRole('button', { name: '用酒馆卡更新 旧卡' }));
  await screen.findByRole('dialog', { name: '确认覆盖游戏卡' });
  expect(context.repository.importFile).toHaveBeenCalledWith({ tavernOnly: true });
  expect(context.repository.stageTavernImport).toHaveBeenCalledWith('task', expect.anything(), 'old');
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '覆盖并导入' }));
  await screen.findByText('导入成功：Alice');
});

test.each(['cancel', 'unmount'])('%s aborts a pending Worker and cleans the token without staging', async action => {
  let signal;
  compileTavern.mockImplementation((_input, nextSignal) => {
    signal = nextSignal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('canceled'))));
  });
  const context = setup();
  fireEvent.click(screen.getByRole('button', { name: '导入游戏卡文件' }));
  await screen.findByRole('button', { name: '取消导入' });
  if (action === 'cancel') fireEvent.click(screen.getByRole('button', { name: '取消导入' }));
  else context.unmount();
  await waitFor(() => expect(context.repository.cancelTavernImport).toHaveBeenCalledWith('task'));
  expect(signal.aborted).toBe(true);
  expect(context.repository.stageTavernImport).not.toHaveBeenCalled();
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  expect(context.onError.mock.calls.every(([error]) => !error)).toBe(true);
});

test('unmounting a pending confirmation resolves cancellation and never commits', async () => {
  const context = setup({ first_mes: '{{unknown}}' });
  fireEvent.click(screen.getByRole('button', { name: '导入游戏卡文件' }));
  await screen.findByRole('dialog');
  await act(async () => context.unmount());
  expect(context.repository.cancelTavernImport).toHaveBeenCalledWith('task');
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
});

test('failed validation shows an error, never an install confirmation', async () => {
  const context = setup();
  context.repository.stageTavernImport.mockRejectedValue(new Error('schema invalid'));
  fireEvent.click(screen.getByRole('button', { name: '导入游戏卡文件' }));
  await screen.findByText('导入失败，请查看错误详情');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  expect(context.repository.cancelTavernImport).toHaveBeenCalledWith('task');
});
