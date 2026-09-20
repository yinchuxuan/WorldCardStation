import { webcrypto } from 'crypto';
import { canonical, sha256, contentFingerprint, createReference, fileUrl, safeResourcePath } from '../../../src/web/cache/releaseIdentity.js';
import { validateManifest } from '../../../src/web/cache/releaseManifest.js';
import schema from '../../../src/shared/game-card/schema/game-card.schema.json';
import pkg from '../../../package.json';

beforeAll(() => { Object.defineProperty(global.crypto, 'subtle', { value: webcrypto.subtle, configurable: true }); });
async function fixture() {
  const files = [{ path: 'card.json', bytes: 2, sha256: await sha256(new TextEncoder().encode('{}')), mediaType: 'application/json' }];
  const body = { formatVersion: 1, cardId: 'demo', cardVersion: '1', contentFingerprint: await contentFingerprint(files),
    schemaVersion: schema['x-schema-version'], platformVersion: pkg.version, entry: 'card.json', name: '示例', description: '', files, cover: null };
  const releaseId = `sha256-${await sha256(new TextEncoder().encode(canonical(body)))}`;
  const entry = { cardId: 'demo', cardVersion: '1', releaseId, name: '示例', description: '', cover: null, release: `demo/${releaseId}/release.json` };
  return { manifest: { ...body, releaseId }, reference: await createReference(entry, 'https://example.test/cards/'), entry };
}
test('validates manifest identity and isolates source and release cache keys', async () => {
  const { manifest, reference, entry } = await fixture();
  await expect(validateManifest(manifest, reference)).resolves.toEqual(manifest);
  const other = await createReference(entry, 'https://example.test/other/');
  expect(other.cacheName).not.toBe(reference.cacheName);
  expect(other.key).not.toBe(reference.key);
  expect(fileUrl(reference, '世界/序章.md')).toContain('%E4%B8%96');
  await expect(createReference(entry, 'file:///cards/')).rejects.toThrow('来源');
});
test.each(['../escape', '/absolute', 'a//b', './card.json', 'a\\b', 'a%2fb', 'https://bad', '.secret', 'a?b', 'a#b', 'a.'])('rejects unsafe resource path %s', path => {
  expect(() => safeResourcePath(path)).toThrow();
});
test.each([
  value => { value.formatVersion = 2; }, value => { value.schemaVersion = '999'; },
  value => { value.platformVersion = '999'; }, value => { value.cardId = 'other'; },
  value => { value.files.push({ ...value.files[0] }); },
  value => { value.files[0].bytes = -1; }, value => { value.files[0].sha256 = 'bad'; },
  value => { value.files[0].mediaType = 'image/png'; }, value => { value.files[0].path = '../bad'; },
  value => { value.name = 'tampered'; }, value => { value.extra = true; },
  value => { value.files = []; }, value => { value.cover = {}; }
])('rejects malformed, incompatible or tampered manifest %#', async change => {
  const { manifest, reference } = await fixture(); change(manifest);
  await expect(validateManifest(manifest, reference)).rejects.toThrow();
});
