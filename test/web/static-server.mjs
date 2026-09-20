import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const observer = `<script>window.__startupErrors=[];
addEventListener('error',e=>window.__startupErrors.push(e.message||'resource: '+e.target.src),true);
addEventListener('unhandledrejection',e=>window.__startupErrors.push(String(e.reason)));</script>`;

export async function startStaticServer(port = 1430) {
  const requests = [];
  let fault = { mode: 'none', suffix: '' };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/__versions') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(await readFile('dist/web-fixture/versions.json')); return;
    }
    if (url.pathname === '/__fault') {
      let body = '';
      for await (const chunk of request) body += chunk;
      fault = JSON.parse(body); response.writeHead(200).end(); return;
    }
    if (url.pathname === '/__requests') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(requests)); return;
    }
    if (url.pathname.includes('/cards/') && decodeURIComponent(url.pathname).endsWith(fault.suffix)) {
      if (fault.mode === 'delay') await new Promise(resolve => setTimeout(resolve, 1000));
      if (fault.mode === '404') {
        requests.push({ path: url.pathname, status: 404 }); response.writeHead(404).end(); return;
      }
      if (fault.mode === 'corrupt' || fault.mode === 'truncate') {
        requests.push({ path: url.pathname, status: 200 });
        response.writeHead(200, fault.mode === 'truncate' ? { 'Content-Length': '1000' } : {});
        response.write('bad');
        if (fault.mode === 'truncate') response.destroy(); else response.end();
        return;
      }
    }
    const cardsPrefix = url.pathname.startsWith('/play/cards/') ? '/play/cards/' : '/cards/';
    const mount = url.pathname.startsWith(cardsPrefix) ? [cardsPrefix, 'web-fixture/cards']
      : url.pathname.startsWith('/play/') ? ['/play/', 'web-subpath']
      : url.pathname.startsWith('/integration/') ? ['/integration/', 'web-harness'] : ['/', 'web'];
    const root = path.resolve('dist', mount[1]);
    try {
      const file = path.resolve(root, decodeURIComponent(url.pathname.slice(mount[0].length)) || 'index.html');
      if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
      let body = await readFile(file);
      // Observation only; served application scripts are the actual production artifacts.
      if (path.extname(file) === '.html') body = Buffer.from(body.toString().replace('<head>', `<head>${observer}`));
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
      requests.push({ path: url.pathname, status: 200 });
    } catch {
      requests.push({ path: url.pathname, status: 404 });
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { requests, close: () => new Promise(resolve => server.close(resolve)) };
}
