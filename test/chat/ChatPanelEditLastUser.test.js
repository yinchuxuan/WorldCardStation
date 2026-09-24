import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import ChatPanel from '../../src/renderer/ChatPanel.jsx';

const platformMock = global.platformMock;

describe('ChatPanel last user message edit resend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com/v1', apiKey: 'test-api-key', modelName: 'gpt-4' }
    });
    platformMock.getChatHistory.mockResolvedValue({
      success: true,
      messages: [
        { role: 'user', content: '原来的选择' },
        { role: 'assistant', content: '旧回复' }
      ],
      retryBaseMessages: [{ role: 'user', content: '原来的选择' }],
      retryBaseState: { score: 3 }
    });
    global.fetch = jest.fn().mockResolvedValue(global.createStreamingMock('新回复'));
  });

  test('clicking last user bubble enters inline edit mode', async () => {
    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByText('原来的选择'));

    const textarea = screen.getByLabelText('编辑用户消息');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('原来的选择');
    expect(textarea).toHaveClass('chat-message-edit-textarea');
  });

  test('retry sends the edited last user content from retry base', async () => {
    render(React.createElement(ChatPanel));
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByText('原来的选择'));
    fireEvent.change(screen.getByLabelText('编辑用户消息'), { target: { value: '修改后的选择' } });
    fireEvent.click(screen.getByRole('button', { name: '重新生成回复' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: 'user', content: '修改后的选择' }]);
    await waitFor(() => expect(screen.queryByLabelText('编辑用户消息')).not.toBeInTheDocument());
    expect(platformMock.saveChatHistory).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({
      runtimeSession: expect.objectContaining({ retryBase: expect.objectContaining({ input: '修改后的选择',
        snapshot: expect.objectContaining({ state: { score: 3 }, messages: [] }) }) })
    }));
    fireEvent.click(screen.getByText('修改后的选择'));
    expect(screen.getByLabelText('编辑用户消息')).toHaveValue('修改后的选择');
  });
});
