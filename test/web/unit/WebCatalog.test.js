import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WebCatalog from '../../../src/web/WebCatalog.jsx';
import { loadCatalog } from '../../../src/web/catalog.js';

jest.mock('../../../src/web/catalog.js', () => ({ loadCatalog: jest.fn() }));

test('renders name, version, escaped description and optional cover', async () => {
  loadCatalog.mockResolvedValue([
    { cardId: 'one', cardVersion: '1.0', name: '示例卡', description: '<script>bad</script>', coverUrl: 'https://example.test/cover.png' },
    { cardId: 'two', cardVersion: '2.0', name: '无封面', description: '', coverUrl: null }
  ]);
  const { container } = render(<WebCatalog />);
  expect(await screen.findByText('示例卡')).toBeInTheDocument();
  expect(screen.getByText('版本 1.0')).toBeInTheDocument();
  expect(screen.getByAltText('示例卡封面')).toHaveAttribute('src', 'https://example.test/cover.png');
  expect(container.querySelector('script')).toBeNull();
  screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled());
});

test('shows loading, failure, retry, then empty state', async () => {
  loadCatalog.mockRejectedValueOnce(new Error('目录不可用')).mockResolvedValueOnce([]);
  render(<WebCatalog />);
  expect(screen.getByText('正在读取游戏目录…')).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('目录不可用');
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('暂时没有已发布的游戏卡。')).toBeInTheDocument();
});

test('unmount aborts request and ignores late result', async () => {
  let resolve;
  loadCatalog.mockImplementation((_base, { signal }) => {
    expect(signal.aborted).toBe(false);
    return new Promise(done => { resolve = done; });
  });
  const { unmount } = render(<WebCatalog />);
  const { signal } = loadCatalog.mock.calls.at(-1)[1];
  unmount();
  expect(signal.aborted).toBe(true);
  resolve([]);
  await waitFor(() => expect(screen.queryByText('暂时没有已发布的游戏卡。')).toBeNull());
});
