import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsGameCardDevelopment from '../../src/renderer/components/SettingsGameCardDevelopment.jsx';

const instructions = '请先阅读 /Applications/世界站.app/Contents/Resources/devkit/development.md，按文档协助我开发当前项目。';
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('Settings game card development', () => {
  let writeText;
  beforeEach(() => {
    jest.clearAllMocks();
    global.platformMock.getGameCardDevelopmentInstructions.mockResolvedValue(instructions);
    writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
  });

  afterEach(() => {
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    else delete navigator.clipboard;
  });

  function copy() {
    fireEvent.click(screen.getByRole('button', { name: '复制给 agent 的开发指令' }));
  }

  test('only retrieves instructions on click and confirms successful clipboard write', async () => {
    render(<SettingsGameCardDevelopment />);
    expect(screen.getByRole('heading', { name: '游戏卡开发' })).toBeInTheDocument();
    expect(screen.queryByText(/将开发指令粘贴给 agent/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开发者模式' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /开发者模式/ })).not.toBeInTheDocument();
    expect(global.platformMock.getGameCardDevelopmentInstructions).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    copy();
    expect(await screen.findByRole('status')).toHaveTextContent('已复制，请粘贴到 agent 对话中');
    expect(writeText).toHaveBeenCalledWith(instructions);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(global.platformMock.importGameCardFromFile).not.toHaveBeenCalled();
    expect(global.platformMock.setActiveGameCard).not.toHaveBeenCalled();
    expect(global.platformMock.saveModelConfig).not.toHaveBeenCalled();
  });

  test.each(['missing', 'rejected'])('shows selectable text when clipboard is %s', async kind => {
    if (kind === 'missing') setClipboard(undefined);
    else writeText.mockRejectedValue(new Error('permission denied'));
    render(<SettingsGameCardDevelopment />);
    copy();
    const text = await screen.findByRole('textbox', { name: '开发指令（可手动复制）' });
    expect(text).toHaveValue(instructions);
    expect(text).toHaveAttribute('readonly');
    fireEvent.focus(text);
    expect(text.selectionStart).toBe(0);
    expect(text.selectionEnd).toBe(instructions.length);
    expect(screen.getByRole('status')).toHaveTextContent('无法自动复制');
    expect(screen.queryByText('已复制，请粘贴到 agent 对话中')).not.toBeInTheDocument();
  });

  test('reports native failure without touching clipboard, then supports retry', async () => {
    global.platformMock.getGameCardDevelopmentInstructions.mockRejectedValueOnce('客户端开发包不完整');
    render(<SettingsGameCardDevelopment />);
    copy();
    expect(await screen.findByRole('alert')).toHaveTextContent('客户端开发包不完整');
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    copy();
    expect(await screen.findByRole('status')).toHaveTextContent('已复制');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('blocks duplicate clicks until clipboard completes, without premature success', async () => {
    let complete;
    writeText.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    render(<SettingsGameCardDevelopment />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(global.platformMock.getGameCardDevelopmentInstructions).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    expect(button).not.toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('已复制');
  });

  test('regenerates instructions on retry and removes outdated fallback text', async () => {
    writeText.mockRejectedValueOnce(new Error('blocked'));
    render(<SettingsGameCardDevelopment />);
    copy();
    await screen.findByRole('textbox');
    global.platformMock.getGameCardDevelopmentInstructions.mockResolvedValue('updated paths');
    copy();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已复制'));
    expect(writeText).toHaveBeenLastCalledWith('updated paths');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
