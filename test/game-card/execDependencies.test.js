import { collectExecDependencies } from '../../src/renderer/gameCard/execDependencies.js';

test('shared include traversal reads shared dependencies once and reuses the caller cache', async () => {
  const files = { 'a.js': 'include("./shared.js");', 'b.js': 'include("./shared.js");', 'shared.js': '' };
  const read = jest.fn(async path => files[path]);
  const cache = new Map();
  expect(await collectExecDependencies(['a.js', 'b.js'], read, cache)).toEqual(new Set(['a.js', 'shared.js', 'b.js']));
  expect(read).toHaveBeenCalledTimes(3);
  await collectExecDependencies(['a.js'], read, cache);
  expect(read).toHaveBeenCalledTimes(3);
});

test('cycles and deep includes remain errors even with cached dependencies', async () => {
  const cycle = async path => path === 'a.js' ? 'include("./b.js");' : 'include("./a.js");';
  await expect(collectExecDependencies(['a.js'], cycle)).rejects.toThrow('circular exec include: a.js');
  await expect(collectExecDependencies(['0.js'], async path => `include("./${Number.parseInt(path) + 1}.js");`))
    .rejects.toThrow('exec include depth exceeded');
});
