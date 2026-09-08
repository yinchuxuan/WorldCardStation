import { createTauriRendererServices } from '../../src/renderer/platform/tauriRendererServices.js';
import { createMemoryRendererServices } from '../../src/renderer/platform/memoryRendererServices.js';

test('Tauri conversion commands use only token-bound plans and revisions', async () => {
  const task = { kind: 'tavern', token: 'token', id: 'new' };
  const invoke = jest.fn(async command => command === 'import_game_card_from_file' ? task : { revision: 'r1' });
  const { cards } = createTauriRendererServices({ invoke });
  expect(await cards.importFile()).toBe(task);
  await cards.importFile({ tavernOnly: true });
  expect(invoke).toHaveBeenLastCalledWith('import_game_card_from_file', { tavernOnly: true });
  await cards.stageTavernImport('token', { files: {}, copies: [] }, 'target');
  expect(invoke).toHaveBeenLastCalledWith('stage_tavern_import', { token: 'token', plan: { files: {}, copies: [] }, targetId: 'target' });
  await cards.commitTavernImport('token', 'r1');
  expect(invoke).toHaveBeenLastCalledWith('commit_tavern_import', { token: 'token', revision: 'r1' });
  await cards.cancelTavernImport('token');
  expect(invoke).toHaveBeenLastCalledWith('cancel_tavern_import', { token: 'token' });
  invoke.mockRejectedValue({ error: 'invalid', stage: 'schema' });
  await expect(cards.stageTavernImport('token', {})).rejects.toMatchObject({ message: 'invalid', stage: 'schema' });
});

test('update-only memory import rejects native cards without installing them', async () => {
  const { cards } = createMemoryRendererServices({ importedCard: { id: 'native' } });
  await expect(cards.importFile({ tavernOnly: true })).rejects.toThrow('请选择 V2/V3');
  expect(await cards.list()).toEqual([]);
});

test('memory service does not install before confirmation and consumes token once', async () => {
  const { cards } = createMemoryRendererServices({ tavernTask: { token: 'token', kind: 'tavern' } });
  await cards.importFile();
  const plan = { files: { 'card.json': JSON.stringify({ id: 'new' }) } };
  const first = await cards.stageTavernImport('token', plan);
  const second = await cards.stageTavernImport('token', plan);
  expect(await cards.list()).toEqual([]);
  await expect(cards.commitTavernImport('token', first.revision)).rejects.toThrow('失效');
  expect(await cards.commitTavernImport('token', second.revision)).toEqual({ id: 'new' });
  await expect(cards.commitTavernImport('token', second.revision)).rejects.toThrow('失效');
});
