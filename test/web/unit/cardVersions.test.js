import { webcrypto } from 'crypto';
import { createReference } from '../../../src/web/cache/releaseIdentity.js';
import { createHostedRepository } from '../../../src/web/cardRepository.js';
beforeAll(() => { Object.defineProperty(crypto, 'subtle', { value: webcrypto.subtle, configurable: true }); });
test('historical references remain selectable after unload without silently upgrading their sessions', async () => {
  const source = new URL('cards/', document.baseURI).href;
  const entry = version => ({ cardId: 'demo', cardVersion: version, releaseId: `sha256-${version.repeat(64)}`,
    name: 'Demo', description: '', cover: null, release: `demo/sha256-${version.repeat(64)}/release.json` });
  const old = await createReference(entry('a'), source);
  let invalidate;
  const manager = { listReferences: async () => [{ ...old, ready: false }, { key: 'unload', epoch: 2 }],
    prepare: jest.fn(async () => ({ card: { id: 'demo' } })), getReference: () => old,
    subscribe: listener => { invalidate = listener; } };
  const repository = createHostedRepository(manager, async () => [entry('b')]);
  const list = await repository.list();
  expect(list).toHaveLength(2);
  expect(list.map(card => card.version)).toEqual(['b', 'a']);
  expect(list[0].selectionId).not.toBe(list[1].selectionId);
  await repository.setActive(list[1].selectionId);
  expect(manager.prepare.mock.calls[0][0].releaseId).toBe(old.releaseId);
  expect(repository.getActiveSelection()).toBe(old.key);
  invalidate();
  expect(sessionStorage.getItem(`wcs-active-card:${source}`)).toBe('null');
});
