import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import cases from '../fixtures/runtime-definition-cases.json';
import { loadRuntimeDefinition } from '../../src/shared/game-card/runtime/loadDefinition.js';
import { validateGameCard } from '../../src/shared/game-card/schema/validateGameCard.js';

const fixture = path.resolve(__dirname, '../fixtures/runtime-definition');
let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcs-runtime-definition-'));
  await fs.cp(fixture, root, { recursive: true });
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));

async function resolve(file) {
  const candidate = await fs.realpath(path.join(root, file));
  const realRoot = await fs.realpath(root);
  if (!candidate.startsWith(`${realRoot}${path.sep}`)) throw new Error('outside card root');
  return candidate;
}

function load(modelIds = ['narration-model']) {
  return loadRuntimeDefinition({
    modelIds,
    readText: async file => fs.readFile(await resolve(file), 'utf8'),
    stat: async file => (await fs.stat(await resolve(file))).isFile() ? 'file' : 'directory'
  });
}

test.each(cases)('$name (shared JS/Rust case)', async item => {
  if (item.removeFile) await fs.unlink(path.join(root, item.removeFile));
  if (item.file) {
    const file = path.join(root, item.file);
    if (item.raw !== undefined) await fs.writeFile(file, item.raw);
    else {
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      const parent = item.path.slice(0, -1).reduce((value, key) => value[key], value);
      const key = item.path.at(-1);
      if (Object.hasOwn(item, 'value')) parent[key] = item.value;
      else delete parent[key];
      await fs.writeFile(file, JSON.stringify(value));
    }
  }
  if (!item.valid) {
    await expect(load(item.modelIds)).rejects.toThrow(item.error);
    return;
  }
  const definition = await load();
  expect(definition.formatVersion).toBe('1');
  expect(definition.main.path).toBe('main.js');
  expect(definition.main.source).toContain('export async function onInput');
  expect(Object.keys(definition.agents).sort()).toEqual(['judge', 'narrator']);
  expect(definition.agents.narrator).toMatchObject({ id: 'narrator', file: 'agents/narrator.json' });
  expect(definition.stateSchema).toEqual({});
  expect(Object.isFrozen(definition.agents.judge.definition.rules)).toBe(true);
  expect(validateGameCard(definition.card)).toMatchObject({ valid: false });
});

test('root-constrained adapter rejects symlink escapes without executing entry', async () => {
  await fs.unlink(path.join(root, 'main.js'));
  await fs.symlink(path.join(fixture, 'main.js'), path.join(root, 'main.js'));
  await expect(load()).rejects.toThrow('main.js: outside card root');
});

test('resource configuration and directory scopes are retained and checked', async () => {
  const file = path.join(root, 'card.json');
  const card = JSON.parse(await fs.readFile(file, 'utf8'));
  card.files.agents = { directory: 'agents', include: ['*.json'] };
  card.visual = { background: { room: 'room.webp' } };
  card.audio = { bgm: { theme: 'theme.ogg' } };
  await fs.writeFile(path.join(root, 'room.webp'), 'fixture');
  await fs.writeFile(path.join(root, 'theme.ogg'), 'fixture');
  await fs.writeFile(file, JSON.stringify(card));
  expect((await load()).card).toEqual(card);
  card.files.agents.directory = 'missing';
  await fs.writeFile(file, JSON.stringify(card));
  await expect(load()).rejects.toThrow('files.agents.directory');
});
