import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RuntimeTraceControl from '../../src/renderer/components/RuntimeTraceControl.jsx';
import ChatHeader from '../../src/renderer/components/ChatHeader.jsx';
import GameCardSwitcher from '../../src/renderer/components/GameCardSwitcher.jsx';
import { runtimeTrace } from '../../src/renderer/trace/runtimeTrace.js';

const scope = { cardId: 'card', sessionId: 'test' };
const messages = [{ role: 'user', content: 'private text' }];

beforeEach(async () => {
  await runtimeTrace.enable(false);
  await runtimeTrace.bind(scope, messages, { turn: 2 });
  jest.clearAllMocks();
  global.platformMock.startSessionTrace.mockResolvedValue({ token: 'trace', path: '/data/card/test/trace.jsonl' });
});
afterEach(async () => { await act(async () => { await runtimeTrace.enable(false); await runtimeTrace.bind(null, [], {}); }); });

test('automatically records the actual session from the title bar without showing paths', async () => {
  const toggleHistory = jest.fn();
  const repository = { list: jest.fn(async () => []) };
  const { container } = render(<ChatHeader onToggleHistory={toggleHistory}>
    <GameCardSwitcher activeCard={{ id: 'card', name: '我的游戏卡' }} isLoading={false}
      onActivate={jest.fn()} onImport={jest.fn()} onUninstall={jest.fn()} repository={repository} />
  </ChatHeader>);
  const toggle = screen.getByRole('button', { name: '开发者模式' });
  const switchCard = screen.getByRole('button', { name: '切换游戏卡' });
  expect(toggle.closest('.chat-header')).not.toBeNull();
  expect(toggle.querySelector('.game-card-title-icon')).toHaveTextContent('square');
  expect(switchCard.querySelector('.game-card-title-icon')).toBeNull();
  expect(switchCard).toHaveTextContent('我的游戏卡');
  expect(switchCard.querySelector('.material-icons')).toBeNull();
  expect(screen.queryByText('开发者模式')).not.toBeInTheDocument();
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(toggle).toHaveAttribute('title', expect.stringContaining('完整消息和游戏状态'));
  expect(global.platformMock.startSessionTrace).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('正在记录'));
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(toggleHistory).not.toHaveBeenCalled();
  expect(switchCard).toHaveAttribute('aria-expanded', 'false');
  expect(repository.list).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '复制日志路径' })).not.toBeInTheDocument();
  expect(container.textContent).not.toContain('/data/');
  expect(global.platformMock.startSessionTrace).toHaveBeenCalledWith(scope, { messages, state: { turn: 2 } });
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
  expect(global.platformMock.closeSessionTrace).toHaveBeenCalledWith('trace');
  expect(runtimeTrace.getSnapshot().path).toBe('/data/card/test/trace.jsonl');
  expect(screen.getByRole('status')).toHaveTextContent('已关闭');
  fireEvent.click(screen.getByText('我的游戏卡'));
  await waitFor(() => expect(repository.list).toHaveBeenCalledTimes(1));
  expect(switchCard).toHaveAttribute('aria-expanded', 'true');
  expect(global.platformMock.startSessionTrace).toHaveBeenCalledTimes(1);
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(toggleHistory).not.toHaveBeenCalled();
  fireEvent.click(container.querySelector('.chat-header'));
  expect(toggleHistory).toHaveBeenCalledTimes(1);
});

test('uses the same square emblem in history view and ordinary chat', () => {
  const { rerender } = render(<ChatHeader onToggleHistory={jest.fn()}>msg历史记录</ChatHeader>);
  expect(screen.getByRole('button', { name: '开发者模式' }).querySelector('.material-icons')).toHaveTextContent('square');
  expect(screen.getAllByRole('button', { name: '开发者模式' })).toHaveLength(1);
  rerender(<ChatHeader onToggleHistory={jest.fn()}>普通聊天</ChatHeader>);
  expect(screen.getByRole('button', { name: '开发者模式' }).querySelector('.material-icons')).toHaveTextContent('square');
});

test('native failure is visible and never claimed as a complete log', async () => {
  global.platformMock.startSessionTrace.mockRejectedValueOnce(Error('permission denied'));
  render(<RuntimeTraceControl />);
  fireEvent.click(screen.getByRole('button', { name: '开发者模式' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('运行日志不完整：permission denied');
  expect(screen.getByRole('status')).toHaveTextContent('日志不完整');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('recording requires no clipboard access or user-provided path', async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = jest.fn().mockRejectedValue(Error('denied'));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    render(<RuntimeTraceControl />);
    fireEvent.click(screen.getByRole('button', { name: '开发者模式' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('正在记录'));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  } finally {
    if (previous) Object.defineProperty(navigator, 'clipboard', previous);
    else delete navigator.clipboard;
  }
});

test('waits for a real card session and follows session changes automatically', async () => {
  await runtimeTrace.bind(null, [], {});
  render(<RuntimeTraceControl />);
  fireEvent.click(screen.getByRole('button', { name: '开发者模式' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('等待游戏卡会话'));
  expect(global.platformMock.startSessionTrace).not.toHaveBeenCalled();
  await act(async () => runtimeTrace.bind(scope, messages, { turn: 3 }));
  expect(screen.getByRole('status')).toHaveTextContent('正在记录');
  expect(global.platformMock.startSessionTrace).toHaveBeenLastCalledWith(scope, { messages, state: { turn: 3 } });
  await act(async () => runtimeTrace.bind({ ...scope, sessionId: 'next' }, [], {}));
  expect(global.platformMock.closeSessionTrace).toHaveBeenCalledWith('trace');
  expect(global.platformMock.startSessionTrace).toHaveBeenLastCalledWith({ ...scope, sessionId: 'next' }, { messages: [], state: {} });
});

test('blocks duplicate toggles until native capture starts', async () => {
  let complete;
  global.platformMock.startSessionTrace.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  render(<RuntimeTraceControl />);
  const button = screen.getByRole('button', { name: '开发者模式' });
  fireEvent.click(button);
  expect(button).toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(global.platformMock.startSessionTrace).toHaveBeenCalledTimes(1));
  await act(async () => complete({ token: 'trace', path: '/data/trace.jsonl' }));
  expect(button).not.toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('正在记录');
});

test('shows subsequent write failures and allows switching recording off', async () => {
  render(<RuntimeTraceControl />);
  fireEvent.click(screen.getByRole('button', { name: '开发者模式' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('正在记录'));
  global.platformMock.appendSessionTrace.mockRejectedValueOnce(Error('disk full'));
  await act(async () => { runtimeTrace.update(messages, { turn: 4 }); await runtimeTrace.flush(); });
  expect(screen.getByRole('alert')).toHaveTextContent('运行日志不完整：disk full');
  expect(screen.getByRole('status')).toHaveTextContent('日志不完整');
  fireEvent.click(screen.getByRole('button', { name: '开发者模式' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
