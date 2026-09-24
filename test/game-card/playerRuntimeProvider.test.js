import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { act, render, screen, waitFor } from '@testing-library/react';
import { GameCardRuntimeProvider, useGameCardRuntime } from '../../src/renderer/chat/GameCardRuntimeProvider.jsx';
import { createBrowserMainSession } from '../../src/renderer/platform/mainWorkerFactory.mjs';

jest.mock('../../src/renderer/platform/mainWorkerFactory.mjs', () => ({ createBrowserMainSession: jest.fn() }));
const root = path.resolve('test/fixtures/runtime-delivery');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const card = JSON.parse(read('card.json'));
let runtime;
function Probe() {
  runtime = useGameCardRuntime();
  return <div>{runtime.activeCard?.name || 'ordinary'}</div>;
}

test('production provider prepares V2 once, exposes no ordinary fallback while loading and disposes on switching', async () => {
  const session = { beginLoad: jest.fn(), dispose: jest.fn(), setState: jest.fn() };
  createBrowserMainSession.mockReturnValue(session);
  const platform = { repository: { getActiveCard: async () => card }, resources: { readText: (_, file) => read(file) } };
  const mounted = render(<GameCardRuntimeProvider platform={platform}><Probe /></GameCardRuntimeProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('正在加载');
  expect(screen.queryByText('ordinary')).not.toBeInTheDocument();
  await screen.findByText(card.name);
  expect(runtime.mainSession).toBe(session);
  expect(session.beginLoad).toHaveBeenCalledTimes(1);
  runtime.applyUiState({ count: 4 });
  expect(session.setState).toHaveBeenCalledWith({ count: 4 });
  await act(async () => runtime.changeActiveCard(null));
  expect(screen.getByText('ordinary')).toBeInTheDocument();
  expect(session.dispose).toHaveBeenCalledTimes(1);
  expect(runtime.mainSession).toBeNull();
  mounted.unmount();
  expect(session.dispose).toHaveBeenCalledTimes(1);
});

test('provider disposes its owned Session on unmount', async () => {
  const session = { beginLoad: jest.fn(), dispose: jest.fn() };
  createBrowserMainSession.mockReturnValue(session);
  const platform = { repository: { getActiveCard: async () => card }, resources: { readText: (_, file) => read(file) } };
  const mounted = render(<GameCardRuntimeProvider platform={platform}><Probe /></GameCardRuntimeProvider>);
  await screen.findByText(card.name);
  mounted.unmount();
  expect(session.dispose).toHaveBeenCalledTimes(1);
});

test('late V2 preparation cannot replace a newer ordinary-chat selection', async () => {
  const session = { beginLoad: jest.fn(), dispose: jest.fn() };
  createBrowserMainSession.mockReturnValue(session);
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const platform = { repository: { getActiveCard: async () => null }, resources: {
    readText: async (_, file) => { markStarted(); await wait; return read(file); }
  } };
  render(<GameCardRuntimeProvider platform={platform}><Probe /></GameCardRuntimeProvider>);
  await screen.findByText('ordinary');
  const change = runtime.changeActiveCard;
  let pending;
  act(() => { pending = change(card); });
  await act(async () => { await started; });
  await act(async () => change(null));
  await act(async () => { release(); await pending; });
  await waitFor(() => expect(screen.getByText('ordinary')).toBeInTheDocument());
  expect(session.dispose).toHaveBeenCalledTimes(1);
});
