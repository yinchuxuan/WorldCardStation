import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TavernImportDialog from '../../src/renderer/components/TavernImportDialog.jsx';

const request = { kind: 'compatibility', name: 'Alice',
  report: [{ code: 'macro', severity: 'warning', location: 'data.first_mes', message: '未知宏保持原文' }] };

test('loss dialog offers continue/cancel directly without conversion options or checkbox', () => {
  const onFinish = jest.fn();
  render(<TavernImportDialog request={request} onFinish={onFinish} />);
  expect(screen.getByText('未知宏保持原文')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByText('转换选项')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '继续导入' }));
  expect(onFinish).toHaveBeenCalledWith(true);
});

test('cancel and Escape decline; dialog traps focus and restores it on close', () => {
  const onFinish = jest.fn();
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  const view = render(<TavernImportDialog request={request} onFinish={onFinish} />);
  const dialog = screen.getByRole('dialog');
  const cancel = screen.getByRole('button', { name: '取消' });
  const accept = screen.getByRole('button', { name: '继续导入' });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(accept).toHaveFocus();
  fireEvent.keyDown(accept, { key: 'Tab' });
  expect(cancel).toHaveFocus();
  fireEvent.click(cancel);
  expect(onFinish).toHaveBeenLastCalledWith(false);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onFinish).toHaveBeenLastCalledWith(false);
  view.unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});

test('overwrite is a separate prompt identifying target and save risk; generation blocks accepting', () => {
  const onFinish = jest.fn();
  const overwrite = { kind: 'overwrite', name: 'New', targetCard: { id: 'old', name: '旧卡' } };
  const view = render(<TavernImportDialog request={overwrite} isLoading onFinish={onFinish} />);
  expect(screen.getByRole('dialog', { name: '确认覆盖游戏卡' })).toBeInTheDocument();
  expect(screen.getByText(/旧状态可能不兼容/)).toHaveTextContent('旧卡');
  expect(screen.getByRole('button', { name: '覆盖并导入' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '取消' })).toBeEnabled();
  view.rerender(<TavernImportDialog request={overwrite} onFinish={onFinish} />);
  fireEvent.click(screen.getByRole('button', { name: '覆盖并导入' }));
  expect(onFinish).toHaveBeenCalledWith(true);
});
