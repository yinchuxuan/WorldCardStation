import { createServer } from 'vite';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const temporary = await mkdtemp(path.join(tmpdir(), 'wcs-web-dev-'));
const previousDirectory = process.env.WEB_CARDS_DIR;
process.env.WEB_CARDS_DIR = path.join(temporary, 'published');
try {
  for (const base of ['/', '/play/']) {
    const directory = path.join(temporary, base === '/' ? 'root-cards' : 'subpath-cards');
    process.env.WEB_CARDS_DIR = directory;
    const server = await createServer({ configFile: path.resolve('vite.config.mjs'), mode: 'web', base,
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: 'error', server: { port: 0, host: '127.0.0.1', open: false, hmr: false } });
    try {
      await server.listen();
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      const url = `${origin}${base}cards/`;
      let response = await fetch(`${url}index.json`);
      assert.equal(response.status, 404, 'Missing catalog must not fall back to HTML');
      assert.match(response.headers.get('content-type'), /application\/json/);
      await response.json();
      await mkdir(directory);
      const index = { formatVersion: 1, cards: [] };
      await writeFile(path.join(directory, 'index.json'), JSON.stringify(index));
      await writeFile(path.join(directory, 'cover.png'), Buffer.from([137, 80, 78, 71]));
      await writeFile(path.join(directory, '.publish.lock'), 'private');
      await writeFile(path.join(temporary, 'secret.json'), 'private');
      response = await fetch(`${url}index.json`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), index);
      response = await fetch(`${url}cover.png`);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal((await response.arrayBuffer()).byteLength, 4);
      assert.equal((await fetch(`${url}cover.png`, { method: 'HEAD' })).headers.get('content-length'), '4');
      assert.equal((await fetch(`${url}index.json`, { method: 'POST' })).status, 405);
      for (const resource of ['missing.png', '.publish.lock', '%2e%2e%2fsecret.json', '%zz', 'bad%5cpath']) {
        assert.equal((await fetch(`${url}${resource}`)).status, 404, resource);
      }
      if (process.platform !== 'win32') {
        await symlink(path.join(temporary, 'secret.json'), path.join(directory, 'linked.json'));
        assert.equal((await fetch(`${url}linked.json`)).status, 404);
      }
      // Published changes become visible without restarting Vite.
      await writeFile(path.join(directory, 'index.json'), JSON.stringify({ ...index, updated: true }));
      assert.equal((await (await fetch(`${url}index.json`)).json()).updated, true);
      response = await fetch(`${origin}${base}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /World Card Station/);
    } finally { await server.close(); }
  }
  console.log('Real Vite root/subpath catalog serving and missing-file safety passed.');
} finally {
  if (previousDirectory === undefined) delete process.env.WEB_CARDS_DIR;
  else process.env.WEB_CARDS_DIR = previousDirectory;
  await rm(temporary, { recursive: true, force: true });
}
