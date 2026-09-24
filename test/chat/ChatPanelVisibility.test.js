import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ChatPanel from '../../src/renderer/ChatPanel.jsx';

async function mount() {
  await act(async () => { render(React.createElement(ChatPanel)); });
  return {
    header: document.querySelector('.chat-header'),
    headerTrigger: document.querySelector('.chat-header-hover-trigger'),
    input: document.querySelector('.chat-input-area'),
    inputTrigger: document.querySelector('.chat-input-hover-trigger'),
    textarea: document.querySelector('.chat-input-textarea')
  };
}

test('reveals header on hover and switches history only after revealing it', async () => {
  const { header, headerTrigger } = await mount();
  expect(header).not.toHaveClass('chat-header-visible');
  fireEvent.mouseEnter(headerTrigger);
  expect(header).toHaveClass('chat-header-visible');
  fireEvent.mouseEnter(header);
  expect(header).toHaveClass('chat-header-visible');
  await act(async () => { fireEvent.click(header); });
  expect(screen.getByText('msg历史记录')).toBeInTheDocument();
  expect(document.querySelector('[data-gc-part="chat-history"]')).toHaveAttribute('data-view', 'history');
  await act(async () => { fireEvent.click(header); });
  expect(screen.getByText('普通聊天')).toBeInTheDocument();
  fireEvent.mouseLeave(header);
  expect(header).not.toHaveClass('chat-header-visible');
});

test('input hover works independently from header hover', async () => {
  const { header, headerTrigger, input, inputTrigger } = await mount();
  expect(input).not.toHaveClass('chat-input-area-visible');
  for (const target of [inputTrigger, input]) {
    fireEvent.mouseEnter(target);
    expect(input).toHaveClass('chat-input-area-visible');
    expect(header).not.toHaveClass('chat-header-visible');
    fireEvent.mouseLeave(target);
    expect(input).not.toHaveClass('chat-input-area-visible');
  }
  fireEvent.mouseEnter(headerTrigger);
  expect(header).toHaveClass('chat-header-visible');
  expect(input).not.toHaveClass('chat-input-area-visible');
});

test('focus or a draft keeps input visible; clearing an unfocused draft hides it', async () => {
  const { input, textarea } = await mount();
  fireEvent.focus(textarea);
  expect(input).toHaveClass('chat-input-area-visible');
  fireEvent.blur(textarea);
  expect(input).not.toHaveClass('chat-input-area-visible');
  fireEvent.change(textarea, { target: { value: 'Hello' } });
  expect(input).toHaveClass('chat-input-area-visible');
  fireEvent.focus(textarea);
  fireEvent.blur(textarea);
  expect(input).toHaveClass('chat-input-area-visible');
  fireEvent.change(textarea, { target: { value: '' } });
  expect(input).not.toHaveClass('chat-input-area-visible');
});
