const React = require('react');
const { render, act } = require('@testing-library/react');
const ChatPanel = require('../../src/renderer/ChatPanel.jsx').default;

test('keeps the decorative reading veil inside history and hidden from assistive technology', async () => {
  await act(async () => { render(React.createElement(ChatPanel)); });
  const history = document.querySelector('[data-gc-part="chat-history"]');
  const veil = history.querySelector('.chat-reading-veil');
  expect(veil).toBeInTheDocument();
  expect(veil).toHaveAttribute('aria-hidden', 'true');
});
