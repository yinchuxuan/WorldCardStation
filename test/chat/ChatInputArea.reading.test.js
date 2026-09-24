import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ChatInputArea from '../../src/renderer/ChatInputArea.jsx';
import { dispatchChatInputCommand } from '../../src/renderer/chat/chatInputCommands.js';

test('reading hides input despite hover, focus commands or drafts, then restores it', async () => {
  const props = {
    isLoading: false, hidden: false, isInputHovered: true, isInputTriggerHovered: true,
    setIsInputHovered: jest.fn(), setIsInputTriggerHovered: jest.fn(),
    onSend: jest.fn(async () => true), onStop: jest.fn()
  };
  const { rerender } = render(<ChatInputArea {...props} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '草稿' } });
  fireEvent.focus(screen.getByRole('textbox'));
  rerender(<ChatInputArea {...props} hidden isLoading />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await act(async () => {
    dispatchChatInputCommand({ type: 'chat.input.focus' });
    dispatchChatInputCommand({ type: 'chat.input.submit' });
    dispatchChatInputCommand({ type: 'chat.send', content: '不能抢跑' });
  });
  expect(props.onSend).not.toHaveBeenCalled();
  expect(props.onStop).not.toHaveBeenCalled();
  // History reading also blocks input even when no operation is running.
  rerender(<ChatInputArea {...props} hidden />);
  await act(async () => dispatchChatInputCommand({ type: 'chat.send', content: '仍未读完' }));
  expect(props.onSend).not.toHaveBeenCalled();
  rerender(<ChatInputArea {...props} />);
  expect(screen.getByRole('textbox')).toHaveValue('草稿');
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await act(async () => {});
  expect(props.onSend).toHaveBeenCalledWith('草稿');
});
