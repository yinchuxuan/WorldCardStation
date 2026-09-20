import { createWebConfig } from '../../../src/web/config.js';

function fixture() {
  let record;
  const store = { get: jest.fn(async () => record), put: jest.fn(async value => { record = JSON.parse(JSON.stringify(value)); }) };
  return { store, config: createWebConfig(() => store) };
}
test('key and model settings persist by default across instances', async () => {
  const { store, config } = fixture();
  await config.save({ apiKey: 'secret', modelName: 'test' });
  expect(await config.load()).toMatchObject({ apiKey: 'secret' });
  expect((await store.get()).value.apiKey).toBe('secret');
  expect(await createWebConfig(() => store).load()).toMatchObject({ apiKey: 'secret', modelName: 'test' });
});
test('legacy remember flags are ignored and clearing the field clears the saved key', async () => {
  const { store, config } = fixture();
  await config.save({ apiKey: 'secret', rememberKey: true });
  expect(await createWebConfig(() => store).load()).toMatchObject({ apiKey: 'secret' });
  await config.save({ apiKey: 'secret', rememberKey: false });
  expect((await store.get()).value).toEqual({ apiKey: 'secret' });
  expect(await config.load()).toMatchObject({ apiKey: 'secret' });
  await config.save({ apiKey: '', rememberKey: false });
  expect((await config.load()).apiKey).toBe('');
  expect((await createWebConfig(() => store).load()).apiKey).toBe('');
});
test('write failures propagate, retain last applied config and do not poison queue', async () => {
  const { store, config } = fixture();
  await config.save({ modelName: 'before' });
  store.put.mockRejectedValueOnce(new Error('full'));
  await expect(config.save({ modelName: 'failed' })).rejects.toThrow('full');
  expect((await config.load()).modelName).toBe('before');
  await config.save({ modelName: 'after' });
  expect((await config.load()).modelName).toBe('after');
});
