import { createHostedRepository } from '../../../src/web/cardRepository.js';

test('only entries returned by the trusted catalog can activate; readiness options reach cache preparation', async () => {
  const entry = { cardId: 'demo', cardVersion: '1', name: 'Demo', releaseId: 'sha256-id' };
  const card = { id: 'demo', name: 'Demo', rules: [] };
  const manager = { prepare: jest.fn().mockResolvedValue({ card }), release: jest.fn() };
  const catalog = jest.fn().mockResolvedValue([entry]);
  const repository = createHostedRepository(manager, catalog);
  await expect(repository.setActive('demo')).rejects.toThrow('可信目录');
  expect(await repository.list()).toEqual([{ ...entry, id: 'demo', version: '1' }]);
  const options = { signal: new AbortController().signal, onProgress: jest.fn() };
  await expect(repository.setActive('demo', options)).resolves.toBe(card);
  expect(manager.prepare).toHaveBeenCalledWith(entry, options);
  manager.prepare.mockRejectedValue(new Error('下载失败'));
  await expect(repository.setActive('demo')).rejects.toThrow('下载失败');
  expect(manager.release).not.toHaveBeenCalled();
  await expect(repository.setActive(null)).resolves.toBeNull();
  expect(manager.release).toHaveBeenCalledTimes(1);
});
test('uninstall only accepts listed entries and explicitly requests all versions by default', async () => {
  const entry = { cardId: 'demo', name: 'Demo' };
  const manager = { uninstall: jest.fn().mockResolvedValue({ removed: ['one'] }) };
  const repository = createHostedRepository(manager, async () => [entry]);
  await expect(repository.uninstall('missing')).rejects.toThrow('确认要卸载');
  await repository.list(); await repository.uninstall('demo');
  expect(manager.uninstall).toHaveBeenLastCalledWith(entry, { allVersions: true });
  await repository.uninstall('demo', { allVersions: false });
  expect(manager.uninstall).toHaveBeenLastCalledWith(entry, { allVersions: false });
});
