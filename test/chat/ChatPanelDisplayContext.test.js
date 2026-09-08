import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';

test.each([false, true])('chat UI wires readonly state and real-message depths (segmented=%s)', async segmentedReading => {
  const rule = { stage: 'before_markdown', type: 'regex_replace', pattern: '(.*)',
    replace: [{ state: 'player.name' }, ':', { capture: 1 }] };
  global.platformMock.getActiveGameCard.mockResolvedValue({ success: true, card: {
    id: 'display-context', name: 'Display context', version: '1', rules: [],
    display: { segmentedReading,
      user: [{ ...rule, minDepth: 1, maxDepth: 1 }],
      assistant: [{ ...rule, minDepth: 0, maxDepth: 0 }] }
  } });
  global.platformMock.getModelConfig.mockResolvedValue({ success: true, config: {} });
  global.platformMock.getChatHistory.mockResolvedValue({ success: true,
    gameState: { player: { name: 'Alice' } }, messages: [
      { role: 'system', content: 'hidden' },
      { role: 'assistant', content: 'example', _meta: { visibility: 'llm_only' } },
      { id: 'user', role: 'user', content: 'question' },
      { id: 'assistant', role: 'assistant', content: 'answer' }
    ] });
  const view = render(<ChatPanel />);
  await screen.findByText('Alice:answer');
  expect(screen.getByText('Alice:question')).toBeInTheDocument();
  expect(view.container.textContent).not.toContain('example');
});
