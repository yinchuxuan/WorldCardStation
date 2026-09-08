import { act, renderHook } from '@testing-library/react';
import useGameCardSwitching from '../../src/renderer/chat/useGameCardSwitching.js';
import { compileTavern } from '../../src/renderer/gameCard/compileTavern.js';
import { convertTavernCard } from '../../src/shared/tavern-import/convert.js';
import { source } from '../tavern-import/runtime.js';

jest.mock('../../src/renderer/gameCard/compileTavern.js', () => ({ compileTavern: jest.fn() }));
beforeEach(() => compileTavern.mockImplementation(async input => convertTavernCard(input)));

function setup(data = {}) {
  const card = { id: 'new', name: 'New' };
  const task = { kind: 'tavern', token: 'task', id: 'new', source: source(data) };
  const repository = { importFile: jest.fn(async () => task),
    stageTavernImport: jest.fn(async () => ({ revision: 'revision' })),
    commitTavernImport: jest.fn(async () => card), cancelTavernImport: jest.fn(async () => {}) };
  const runtime = { setRuntimeError: jest.fn(), changeActiveCard: jest.fn() };
  const session = { saveCurrent: jest.fn(async () => {}), reload: jest.fn(async () => {}) };
  const presentation = { stopBgm: jest.fn(), updateAll: jest.fn() };
  const hook = renderHook(({ isLoading }) => useGameCardSwitching({ isLoading, repository, runtime, session, presentation }), { initialProps: { isLoading: false } });
  return { ...hook, repository, runtime, session, card };
}

test('compatible Tavern cards stage and commit automatically, including info-only reports', async () => {
  const context = setup({ extensions: { fav: true, talkativeness: 0.5, depth_prompt: { prompt: '', depth: 4 } } });
  const confirm = jest.fn();
  await act(async () => context.result.current.importCard(confirm));
  expect(confirm).not.toHaveBeenCalled();
  expect(context.repository.stageTavernImport).toHaveBeenCalledWith('task', expect.objectContaining({ worldbook: false }), null);
  expect(context.repository.commitTavernImport).toHaveBeenCalledWith('task', 'revision');
  expect(context.repository.stageTavernImport.mock.invocationCallOrder[0]).toBeLessThan(context.repository.commitTavernImport.mock.invocationCallOrder[0]);
  expect(context.runtime.changeActiveCard).toHaveBeenCalledWith(context.card);
  expect(context.session.saveCurrent).toHaveBeenCalledTimes(2);
  expect(context.repository.cancelTavernImport).toHaveBeenCalledWith('task');
  await act(async () => context.result.current.importCard());
  expect(context.repository.commitTavernImport).toHaveBeenCalledTimes(2);
});

test('loss confirmation follows validation and includes warnings only', async () => {
  const context = setup({ first_mes: 'Hi {{unknown}}' });
  const confirm = jest.fn(async request => {
    expect(request.kind).toBe('compatibility');
    expect(request.report.length).toBeGreaterThan(0);
    expect(request.report.every(item => item.severity === 'warning')).toBe(true);
    expect(context.repository.stageTavernImport).toHaveBeenCalled();
    expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
    expect(context.runtime.changeActiveCard).not.toHaveBeenCalled();
    return true;
  });
  await act(async () => context.result.current.importCard(confirm));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(context.repository.commitTavernImport).toHaveBeenCalledWith('task', 'revision');
});

test('null nickname fallback does not require an import confirmation', async () => {
  const context = setup({ nickname: null });
  const confirm = jest.fn();
  await act(async () => context.result.current.importCard(confirm));
  expect(confirm).not.toHaveBeenCalled();
  expect(context.repository.commitTavernImport).toHaveBeenCalledWith('task', 'revision');
  expect(context.runtime.changeActiveCard).toHaveBeenCalledWith(context.card);
});

test('cancel and absent confirmation cannot install a lossy card', async () => {
  const context = setup({ first_mes: '{{unknown}}' });
  await act(async () => expect(context.result.current.importCard(async () => false)).resolves.toBeNull());
  await act(async () => expect(context.result.current.importCard()).rejects.toThrow('需要确认'));
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  expect(context.runtime.changeActiveCard).not.toHaveBeenCalled();
  expect(context.repository.cancelTavernImport).toHaveBeenCalledTimes(2);
});

test('overwrite is independently confirmed with an explicit target, even without warnings', async () => {
  const context = setup();
  const targetCard = { id: 'old', name: '旧卡' };
  const confirm = jest.fn(async () => false);
  await act(async () => context.result.current.importCard(confirm, { targetCard }));
  expect(context.repository.importFile).toHaveBeenCalledWith({ tavernOnly: true });
  expect(context.repository.stageTavernImport).toHaveBeenCalledWith('task', expect.anything(), 'old');
  expect(JSON.parse(context.repository.stageTavernImport.mock.calls[0][1].files['card.json']).id).toBe('old');
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'overwrite', targetCard }));
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  confirm.mockResolvedValue(true);
  await act(async () => context.result.current.importCard(confirm, { targetCard }));
  expect(context.repository.commitTavernImport).toHaveBeenCalledTimes(1);
});

test('accepting compatibility differences never implicitly accepts overwriting', async () => {
  const context = setup({ extensions: { regex_scripts: [{ scriptName: 'plugin', findRegex: 'x' }] } });
  const confirm = jest.fn(async request => request.kind === 'compatibility');
  await act(async () => context.result.current.importCard(confirm, { targetCard: { id: 'old' } }));
  expect(confirm.mock.calls.map(([request]) => request.kind)).toEqual(['compatibility', 'overwrite']);
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
});

test('schema errors and report errors cannot reach confirmation or installation', async () => {
  const context = setup();
  const confirm = jest.fn();
  context.repository.stageTavernImport.mockRejectedValueOnce(new Error('schema invalid'));
  await act(async () => expect(context.result.current.importCard(confirm)).rejects.toThrow('schema invalid'));
  compileTavern.mockResolvedValueOnce({ report: [{ severity: 'error', location: 'data', message: 'invalid' }] });
  await act(async () => expect(context.result.current.importCard(confirm)).rejects.toThrow('data：invalid'));
  expect(confirm).not.toHaveBeenCalled();
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  expect(context.repository.cancelTavernImport).toHaveBeenCalledTimes(2);
});

test('cancellation after staging prevents automatic commit and cleans the task', async () => {
  const context = setup();
  const controller = new AbortController();
  context.repository.stageTavernImport.mockImplementation(async () => { controller.abort(); return { revision: 'revision' }; });
  await act(async () => expect(context.result.current.importCard(undefined, { signal: controller.signal })).rejects.toMatchObject({ canceled: true }));
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  expect(context.repository.cancelTavernImport).toHaveBeenCalledWith('task');
});

test('generation is checked after confirmation and again after saving', async () => {
  const context = setup({ first_mes: '{{unknown}}' });
  let finish;
  let pending;
  await act(async () => { pending = context.result.current.importCard(() => new Promise(resolve => { finish = resolve; })); });
  context.rerender({ isLoading: true });
  await act(async () => { finish(true); await expect(pending).rejects.toThrow('生成期间'); });
  context.rerender({ isLoading: false });
  let saved;
  context.session.saveCurrent.mockImplementationOnce(async () => {}).mockImplementationOnce(() => new Promise(resolve => { saved = resolve; }));
  await act(async () => { pending = context.result.current.importCard(async () => true); });
  context.rerender({ isLoading: true });
  await act(async () => { saved(); await expect(pending).rejects.toThrow('生成期间'); });
  expect(context.repository.commitTavernImport).not.toHaveBeenCalled();
  expect(context.repository.cancelTavernImport).toHaveBeenCalledTimes(2);
});
