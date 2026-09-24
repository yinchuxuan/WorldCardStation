import React from 'react';
import { render, screen } from '@testing-library/react';
import GameCardUIRoot from '../../src/renderer/components/GameCardUIRoot.jsx';

test('card UI receives transient pending input independently of loading and old messages', async () => {
  global.platformMock.readGameCardFile.mockResolvedValue({ success: true, content: `
    function Root({ React, ui }) {
      return ui.pendingInput ? React.createElement('div', { role: 'status' }, ui.pendingInput + '…') : null;
    }
  ` });
  const card = { id: 'pending-input', ui: { root: { source: 'ui/root.js' } } };
  const props = { card, isLoading: true, messages: [{ role: 'assistant', content: '旧正文' }] };
  const { rerender } = render(<GameCardUIRoot {...props} pendingInput="玩家输入" />);
  expect(await screen.findByRole('status')).toHaveTextContent('玩家输入…');
  rerender(<GameCardUIRoot {...props} pendingInput={null} />);
  expect(screen.queryByRole('status')).toBeNull();
});
