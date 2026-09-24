import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';
import { defaultChatCard, readDefaultChatFile } from '../../src/renderer/gameCard/defaultChatCard.js';
import { migrateChatHistory } from '../../src/renderer/gameCard/migrateChatHistory.js';

test.each([false, true])('chat UI wires readonly state and real-message depths (segmented=%s)', async segmentedReading => {
  const rule = { stage: 'before_markdown', type: 'regex_replace', pattern: '(.*)',
    replace: [{ state: 'player.name' }, ':', { capture: 1 }] };
  const card = { ...defaultChatCard,
    display: { segmentedReading,
      user: [{ ...rule, minDepth: 1, maxDepth: 1 }],
      assistant: [{ ...rule, minDepth: 0, maxDepth: 0 }] }
  };
  global.platformMock.getActiveGameCard.mockResolvedValue({ success: true, card });
  global.platformMock.readGameCardFile.mockImplementation(async (_, file) => ({ success: true,
    content: file === 'card.json' ? JSON.stringify(card) : await readDefaultChatFile(file) }));
  global.platformMock.getModelConfig.mockResolvedValue({ success: true, config: {} });
  global.platformMock.getChatHistory.mockResolvedValue({ success: true, ...migrateChatHistory({
    gameState: { player: { name: 'Alice' } }, messages: [
      { role: 'system', content: 'hidden' },
      { role: 'assistant', content: 'example', _meta: { visibility: 'llm_only' } },
      { id: 'user', role: 'user', content: 'question' },
      { id: 'assistant', role: 'assistant', content: 'answer' }
  ] }) });
  const view = render(<ChatPanel />);
  await screen.findByText('Alice:answer', {}, { timeout: 5000 });
  expect(screen.getByText('Alice:question')).toBeInTheDocument();
  expect(view.container.textContent).not.toContain('example');
});
