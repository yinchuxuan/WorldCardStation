import { createHostedCards } from '../../../src/web/hostedCards.js';
import { createReference } from '../../../src/web/cache/releaseIdentity.js';
import { prepareRelease } from '../../../src/web/cache/prepareRelease.js';
jest.mock('../../../src/web/cache/releaseIdentity.js', () => ({ createReference: jest.fn() }));
jest.mock('../../../src/web/cache/prepareRelease.js', () => ({ prepareRelease: jest.fn() }));
const context = () => ({ card: { id: 'demo' }, preloaded: { fileContents: {} }, dispose: jest.fn(),
  resources: { readText: jest.fn().mockResolvedValue('text'), getImageUrl: jest.fn().mockResolvedValue('blob:image'),
    getAudioUrl: jest.fn().mockResolvedValue('blob:audio') } });
const create = () => createHostedCards({ source: 'https://example.test/cards/', caches: {} });
beforeEach(() => { createReference.mockResolvedValue({ key: 'one' }); });
test('activates only prepared resources and disposes the previous context', async () => {
  const manager = create(), first = context(), second = context();
  prepareRelease.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  expect((await manager.prepare({})).card).toBe(first.card);
  await expect(manager.resources.readText('demo', 'text.md')).resolves.toBe('text');
  await expect(manager.resources.getImageUrl('demo', 'image.png')).resolves.toBe('blob:image');
  await expect(manager.resources.getAudioUrl('demo', 'audio.wav')).resolves.toBe('blob:audio');
  await manager.prepare({}); expect(first.dispose).toHaveBeenCalledTimes(1);
  manager.release(); expect(second.dispose).toHaveBeenCalledTimes(1);
  await expect(manager.repository.getActiveCard()).resolves.toBeNull();
});
test('failure preserves current context and retry is not a permanently rejected promise', async () => {
  const manager = create(), first = context();
  prepareRelease.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('bad')).mockResolvedValueOnce(context());
  await manager.prepare({});
  await expect(manager.prepare({})).rejects.toThrow('bad');
  expect(first.dispose).not.toHaveBeenCalled();
  await expect(manager.repository.getActiveCard()).resolves.toBe(first.card);
  await manager.prepare({}); expect(first.dispose).toHaveBeenCalled();
});
test('rejects concurrent preparation without invalidating an already running download', async () => {
  const manager = create(), value = context(); let finish;
  prepareRelease.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = manager.prepare({}); await Promise.resolve();
  await expect(manager.prepare({})).rejects.toThrow('正在准备');
  finish(value); await first;
  await expect(manager.repository.getActiveCard()).resolves.toBe(value.card);
});
test('release discards late results during identity lookup or preparation', async () => {
  const manager = create(); let resolve;
  createReference.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const first = manager.prepare({}); manager.release(); resolve({ key: 'one' });
  await expect(first).rejects.toThrow('过期');
  const value = context();
  prepareRelease.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const second = manager.prepare({}); await Promise.resolve(); manager.release(); resolve(value);
  await expect(second).rejects.toThrow('过期');
  expect(value.dispose).toHaveBeenCalled();
  await expect(manager.repository.getActiveCard()).resolves.toBeNull();
});
