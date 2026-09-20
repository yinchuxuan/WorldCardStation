import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CardDownload from '../../../src/web/CardDownload.jsx';
import { hostedCards } from '../../../src/web/hostedCards.js';
jest.mock('../../../src/web/hostedCards.js', () => ({ hostedCards: { prepare: jest.fn() } }));

test('prepares resources, shows progress and ready, then supports checking again', async () => {
  hostedCards.prepare.mockImplementation(async (_card, { onProgress }) => {
    onProgress({ phase: 'downloading', completedBytes: 1, totalBytes: 10 });
    onProgress({ phase: 'ready', completedBytes: 10, totalBytes: 10 });
  });
  render(<CardDownload card={{ cardId: 'one' }} />);
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByText(/资源已就绪/)).toBeInTheDocument();
  await act(async () => {});
  expect(screen.getByRole('button')).toBeEnabled();
});
test('cancel reaches the in-flight request and retry clears its error', async () => {
  hostedCards.prepare.mockImplementation((_card, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('canceled', 'AbortError')));
  }));
  render(<CardDownload card={{ cardId: 'one' }} />);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByText('取消下载'));
  expect(await screen.findByRole('alert')).toHaveTextContent('下载已取消');
  hostedCards.prepare.mockRejectedValue(new Error('空间不足'));
  fireEvent.click(screen.getByText('重试下载'));
  expect(await screen.findByRole('alert')).toHaveTextContent('空间不足');
});
