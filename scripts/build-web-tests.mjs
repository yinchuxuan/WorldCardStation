import { build } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = process.cwd();
const configFile = path.join(root, 'vite.config.mjs');
async function digest(directory) {
  const hash = createHash('sha256');
  for (const entry of (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).sort((a, b) => `${a.parentPath}/${a.name}`.localeCompare(`${b.parentPath}/${b.name}`))) {
    hash.update(path.relative(directory, path.join(entry.parentPath, entry.name)));
    hash.update(await readFile(path.join(entry.parentPath, entry.name)));
  }
  return hash.digest('hex');
}

await build({ configFile, mode: 'production', logLevel: 'warn' });
const desktopHash = await digest('dist/renderer');
await build({ configFile, mode: 'web', base: '/', logLevel: 'warn' });
assert.equal(await digest('dist/renderer'), desktopHash, 'Web build altered desktop output');
const webHash = await digest('dist/web');
await build({ configFile, mode: 'production', logLevel: 'warn' });
assert.equal(await digest('dist/web'), webHash, 'Desktop build altered Web output');
await build({ configFile, mode: 'web', base: '/play/', logLevel: 'warn',
  build: { outDir: path.join(root, 'dist/web-subpath') } });
await build({ configFile, mode: 'web', root: path.join(root, 'test/web/harness'),
  base: '/integration/', logLevel: 'warn', build: { outDir: path.join(root, 'dist/web-harness') } });

for (const directory of ['web', 'web-subpath', 'web-harness']) {
  const graph = JSON.parse(await readFile(`dist/${directory}/module-graph.json`, 'utf8'));
  assert(graph.includes('src/web/platform.js'));
  if (directory !== 'web-harness') {
    assert(graph.includes('src/web/main.jsx'));
    assert(graph.includes('src/web/WebApp.jsx'));
  }
  assert(!graph.some(id => /@tauri-apps|@wdio|platform\/tauri|platform\/desktop|test\/setup/.test(id)));
  if (directory !== 'web-harness') assert(!graph.some(id => id.startsWith('test/')));
}
console.log('Dual-build isolation and Web dependency graphs passed.');
await import('./build-web-publish-fixture.mjs');
await build({ configFile: false, logLevel: 'warn', build: { ssr: 'test/web/pipelineBaseline.js',
  outDir: 'dist/web-baseline', rollupOptions: { output: { format: 'cjs', entryFileNames: 'baseline.cjs' } } } });
const baseline = await createRequire(import.meta.url)(path.join(root, 'dist/web-baseline/baseline.cjs')).baseline();
await writeFile('dist/web-fixture/pipeline.json', JSON.stringify(baseline));
await import('./test-web-dev-server.mjs');
