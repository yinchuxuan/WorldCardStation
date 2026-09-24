import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MainMessages from '../../src/renderer/chat/MainMessages.jsx';

test.each(['continuous', 'segmented'])('retry targets the final visible %s message and stays unavailable during execution', mode => {
  const records = [
    { id: 'old', role: 'assistant', content: 'old', mode },
    { id: 'latest', role: 'assistant', content: 'latest', mode }
  ];
  const handleRetry = jest.fn();
  const props = { messages: records, isLoading: false, handleRetry,
    reading: { page: { id: 'page', record: records[1], text: 'latest page' }, ui: { atLatest: true } } };
  const view = render(<MainMessages {...props} />);
  const button = screen.getByRole('button', { name: '重新生成回复' });
  expect(button.closest('.retry-source-row')).toHaveTextContent(mode === 'segmented' ? 'latest page' : 'latest');
  expect(view.container.querySelectorAll('.retry-source-row')).toHaveLength(1);
  fireEvent.click(button);
  expect(handleRetry).toHaveBeenCalledTimes(1);
  view.rerender(<MainMessages {...props} isLoading />);
  expect(screen.queryByRole('button', { name: '重新生成回复' })).toBeNull();
});
