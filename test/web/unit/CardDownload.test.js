import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import GameCardSwitcher from '../../../src/renderer/components/GameCardSwitcher.jsx';
jest.mock('@platform', () => ({ capabilities: { cardImport: false }, rendererServices: { cards: {} } }));
test('shared selector displays preparation progress, cancellation and allows retry', async () => {
  let signal;
  const activate = jest.fn((_card, options) => new Promise((_resolve, reject) => {
    signal = options.signal;
    options.onProgress({ phase: 'downloading', completedBytes: 1, totalBytes: 10 });
    signal.addEventListener('abort', () => reject(new DOMException('取消下载', 'AbortError')));
  }));
  const props = { onActivate: activate, onImport: jest.fn(), onUninstall: jest.fn(), onError: jest.fn(),
    repository: { list: async () => [{ id: 'one', name: '示例卡' }] } };
  const { unmount } = render(<GameCardSwitcher {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '切换游戏卡' }));
  fireEvent.click(await screen.findByText('示例卡'));
  expect(await screen.findByRole('status')).toHaveTextContent('下载并校验');
  await act(async () => { fireEvent.click(screen.getByText('取消下载')); });
  expect(signal.aborted).toBe(true);
  expect(props.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('取消') }));
  activate.mockResolvedValueOnce({ id: 'one' });
  await act(async () => { fireEvent.click(screen.getByText('示例卡')); });
  expect(activate).toHaveBeenCalledTimes(2);
  unmount();
});
