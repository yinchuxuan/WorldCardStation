import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameCardTitleControl from '../../src/renderer/components/GameCardTitleControl.jsx';
import { GameCardRuntimeProvider } from '../../src/renderer/chat/GameCardRuntimeProvider.jsx';

describe('GameCardTitleControl', () => {
  test.each([['', '模型未配置'], ['example-model', 'example-model']])('shows model status: %s', async (modelName, expected) => {
    const platform = { repository: { getActiveCard: jest.fn(async () => null) } };
    const { container } = render(<GameCardRuntimeProvider platform={platform}>
      <GameCardTitleControl modelName={modelName} onActivateCard={jest.fn()} onImportCard={jest.fn()}
        onUninstallCard={jest.fn()} cardRepository={{ list: async () => [] }} />
    </GameCardRuntimeProvider>);
    await screen.findByText('普通聊天');
    expect(container.querySelector('[data-gc-part="model-status"]')).toHaveTextContent(expected);
    expect(container.querySelector('[data-gc-part="model-status"]')).toHaveClass('game-card-model-status');
  });
  test('routes import through the game card switch callback', async () => {
    const card = { id: 'imported', name: 'Imported Card', version: '1', rules: [] };
    const onImportCard = jest.fn(async () => card);
    const platform = { repository: { getActiveCard: jest.fn(async () => null) } };
    const cardRepository = { list: jest.fn(async () => []) };

    render(
      <GameCardRuntimeProvider platform={platform}>
        <GameCardTitleControl
          cardRepository={cardRepository}
          onActivateCard={jest.fn()}
          onImportCard={onImportCard}
          onUninstallCard={jest.fn()}
        />
      </GameCardRuntimeProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: '切换游戏卡' }));
    fireEvent.click(await screen.findByRole('button', { name: '导入游戏卡文件' }));

    await waitFor(() => expect(onImportCard).toHaveBeenCalled());
  });
});
