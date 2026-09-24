import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { GameCardRuntimeProvider, useGameCardRuntime } from '../../src/renderer/chat/GameCardRuntimeProvider.jsx';
import { createTestGameCardPlatform } from '../platform/tauriTestClient.js';

describe('GameCardRuntimeProvider', () => {
  test('owns the active card, game state, and runtime error', async () => {
    const card = { id: 'runtime-card', name: 'Runtime Card' };
    const platform = { repository: { getActiveCard: jest.fn(async () => card) } };
    const wrapper = ({ children }) => <GameCardRuntimeProvider platform={platform} mainSession={{}}>{children}</GameCardRuntimeProvider>;
    const { result } = renderHook(() => useGameCardRuntime(), { wrapper });
    await waitFor(() => expect(result.current.activeCard).toEqual(card));
    act(() => {
      result.current.setGameState({ score: 5 });
      result.current.setRuntimeError({ message: 'bad state' });
      result.current.changeActiveCard({ id: 'next-card' });
    });
    expect(result.current.activeCard).toEqual({ id: 'next-card' });
    expect(result.current.gameState).toEqual({ score: 5 });
    expect(result.current.runtimeError).toBeNull();
  });

  test('captures active card loading failures', async () => {
    const api = { getActiveGameCard: jest.fn(async () => ({ success: false, error: 'load failed' })) };
    const platform = createTestGameCardPlatform(api);
    const wrapper = ({ children }) => <GameCardRuntimeProvider platform={platform}>{children}</GameCardRuntimeProvider>;
    const { result } = renderHook(() => useGameCardRuntime(), { wrapper });
    await waitFor(() => expect(result.current.runtimeError).toEqual(expect.objectContaining({ message: 'load failed' })));
  });
});
