import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import useChatView from '../../src/renderer/chat/useChatView.js';
import MessageCollapseRenderer from '../../src/renderer/components/MessageCollapseRenderer.jsx';

function ChatView({ messages, loading }) {
  const view = useChatView({ messages, contexts: {} }, loading);
  const [expanded, setExpanded] = React.useState(false);
  return MessageCollapseRenderer.render({ messages: view.messages, isLoading: view.streaming,
    typewriter: view.typewriter, isExpanded: expanded, onExpand: () => setExpanded(true),
    renderUserMessage: message => message.content,
    renderAssistantMessage: message => typeof message === 'string' ? message : message.content,
    renderRetryButton: () => null });
}

test('successive streamed rounds leave only the latest user pinned, with all history available on pull', async () => {
  const { container, rerender } = render(<ChatView messages={[]} loading={false} />);
  const messages = [];
  for (let turn = 1; turn <= 3; turn += 1) {
    messages.push({ id: `user-round-${turn}-`, role: 'user', content: `question ${turn}` });
    rerender(<ChatView messages={[...messages]} loading />);
    messages.push({ id: `visible-round-${turn}-1`, role: 'assistant', content: `answer ${turn}` });
    rerender(<ChatView messages={[...messages]} loading />);
    const keys = [...container.querySelectorAll('[data-message-key]')].map(row => row.dataset.messageKey);
    expect(new Set(keys).size).toBe(keys.length);
    rerender(<ChatView messages={[...messages]} loading={false} />);
    expect([...container.querySelectorAll('.chat-message.user')].map(row => row.textContent)).toEqual([`question ${turn}`]);
    expect([...container.querySelectorAll('.chat-message.assistant')].map(row => row.textContent)).toEqual([`answer ${turn}`]);
  }
  fireEvent.wheel(container.querySelector('.collapsed-message-view'), { deltaY: -400 });
  await waitFor(() => expect(container.querySelector('.collapsed-message-view')).toHaveClass('expanded'));
  expect([...container.querySelectorAll('.chat-message')].map(row => row.textContent))
    .toEqual(messages.map(message => message.content));
});
