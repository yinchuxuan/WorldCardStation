import fs from 'node:fs/promises';
import path from 'node:path';
import { createCachedContext } from '../../src/web/cache/cachedResources.js';

async function fixture() {
  const root = path.resolve('test/fixtures/runtime-delivery');
  const entries = await fs.readdir(root, { recursive: true });
  const texts = new Map();
  for (const file of entries) {
    if ((await fs.stat(path.join(root, file))).isFile()) texts.set(file, await fs.readFile(path.join(root, file), 'utf8'));
  }
  const card = JSON.parse(texts.get('card.json'));
  card.files = { entries: { directory: 'empty', include: ['*.md'] } };
  texts.set('card.json', JSON.stringify(card));
  const manifest = { files: [...texts].map(([file, text]) => ({
    path: file, bytes: Buffer.byteLength(text), sha256: file, mediaType: file.endsWith('.json') ? 'application/json' : 'text/javascript'
  })) };
  const reference = { baseUrl: 'https://example.test/cards/release/', cardId: card.id, cardVersion: card.version };
  const cache = { match: jest.fn(async url => {
    const file = decodeURIComponent(url.slice(reference.baseUrl.length));
    const text = texts.get(file);
    if (text === undefined) return undefined;
    return { json: async () => JSON.parse(text), text: async () => text,
      headers: new Map([['X-WCS-SHA256', file], ['Content-Length', String(Buffer.byteLength(text))]]) };
  }) };
  return { cache, reference, manifest, texts };
}

test('cached V2 card loads all Agent/main dependencies and supports an authorized empty scope', async () => {
  const { cache, reference, manifest } = await fixture();
  const context = await createCachedContext(cache, manifest, reference);
  expect(context.preloaded.graph.modules.map(item => item.path)).toEqual(['scripts/narrate.js', 'main.js']);
  expect(context.preloaded.definition.agents.judge.definition.rules).toHaveLength(2);
  await expect(context.resources.readText(reference.cardId, 'empty/unknown.md')).rejects.toThrow('类型不匹配');
  context.dispose();
  await expect(context.resources.readText(reference.cardId, 'main.js')).rejects.toThrow('已释放');
});

test('missing cached Agent imports or main modules cannot become playable', async () => {
  for (const file of ['rules/input.json', 'scripts/narrate.js']) {
    const { cache, reference, manifest, texts } = await fixture();
    texts.delete(file);
    await expect(createCachedContext(cache, manifest, reference)).rejects.toThrow(file);
  }
});
