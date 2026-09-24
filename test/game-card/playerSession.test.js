import fs from 'node:fs';
import path from 'node:path';
import { loadPlayerSession } from '../../src/renderer/gameCard/loadPlayerSession.js';

const root = path.resolve('test/fixtures/runtime-delivery');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const card = JSON.parse(read('card.json'));

test('player loads the complete definition before enabling input and never resolves credentials during loading', async () => {
  const config = { load: jest.fn().mockResolvedValue({ apiKey: 'not-for-scripts' }) };
  const beginLoad = jest.fn();
  const factory = jest.fn(() => ({ beginLoad }));
  const platform = { resources: { readText: jest.fn((id, file) => { expect(id).toBe(card.id); return read(file); }) } };
  const loaded = await loadPlayerSession(card, platform, config, factory);
  expect(loaded.card).toEqual(card);
  expect(beginLoad).toHaveBeenCalledTimes(1);
  expect(factory.mock.calls[0][0].program.graph.modules.map(item => item.path)).toEqual(['scripts/narrate.js', 'main.js']);
  expect(config.load).not.toHaveBeenCalled();
  expect(JSON.stringify(factory.mock.calls[0][0].program)).not.toContain('not-for-scripts');
});

test('ordinary chat loads a built-in runtime without repository resources', async () => {
  const factory = jest.fn(() => ({ beginLoad: jest.fn() }));
  const loaded = await loadPlayerSession(null, {}, {}, factory);
  expect(loaded.card).toBeNull();
  expect(factory.mock.calls[0][0].definition.card.statePatch).toEqual({ enabled: false });
  expect(factory.mock.calls[0][0].migrateHistory).toEqual(expect.any(Function));
});

test('old cards and missing main dependencies cannot create a Session', async () => {
  const factory = jest.fn();
  await expect(loadPlayerSession({ id: 'old', rules: [] })).rejects.toThrow('旧版协议');
  const platform = { resources: { readText: (_, file) => {
    if (file === 'scripts/narrate.js') throw new Error('missing module');
    return read(file);
  } } };
  await expect(loadPlayerSession(card, platform, {}, factory)).rejects.toThrow('missing module');
  expect(factory).not.toHaveBeenCalled();
});
