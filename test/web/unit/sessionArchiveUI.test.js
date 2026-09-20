import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatSessionManager from '../../../src/renderer/components/ChatSessionManager.jsx';
import SessionSaveControl from '../../../src/renderer/components/SessionSaveControl.jsx';
jest.mock('@platform', () => ({ savePolicy: 'manual', rendererServices: { sessions: {} } }));

test('Web uses the shared archive button and captures live memory without loading old history', async () => {
  const repository = { list: jest.fn(async () => ({ sessions: [], activeId: 'old' })),
    loadHistory: jest.fn(), create: jest.fn(), saveHistory: jest.fn() };
  const control = { save: jest.fn(async () => {}), blocked: false, dirty: true };
  const beforeLeave = jest.fn();
  render(<ChatSessionManager repository={repository} saveControl={control} onBeforeSessionChange={beforeLeave} />);
  expect(screen.queryByRole('button', { name: '保存进度' })).toBeNull();
  expect(screen.queryByText('有未存档的修改')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '管理聊天会话' }));
  expect(screen.queryByText('有未存档的修改')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '保存当前会话' }));
  await waitFor(() => expect(control.save).toHaveBeenCalledTimes(1));
  expect(repository.loadHistory).not.toHaveBeenCalled();
  expect(repository.create).not.toHaveBeenCalled();
  expect(beforeLeave).not.toHaveBeenCalled();
});
test.each([{}, { dirty: true }, { saving: true }, { savedAt: 123456789 }])(
  'session panel has no permanent save hint: %j', control => {
    const { container } = render(<SessionSaveControl control={control} />);
    expect(container).toBeEmptyDOMElement();
  }
);
test('save errors remain visible and conflicts offer recovery', () => {
  const onReload = jest.fn();
  render(<SessionSaveControl control={{ error: new Error('存档冲突'), conflict: true }} onReload={onReload} />);
  expect(screen.getByRole('alert')).toHaveTextContent('存档冲突');
  fireEvent.click(screen.getByRole('button', { name: '重新加载存档（丢弃本页修改）' }));
  expect(onReload).toHaveBeenCalledTimes(1);
});
test('unstable state disables archiving without hiding the session panel', () => {
  const repository = { list: jest.fn(async () => ({ sessions: [] })) };
  render(<ChatSessionManager repository={repository} saveControl={{ blocked: true }} />);
  fireEvent.click(screen.getByRole('button', { name: '管理聊天会话' }));
  expect(screen.getByRole('button', { name: '保存当前会话' })).toBeDisabled();
});
