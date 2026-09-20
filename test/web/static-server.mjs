import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const observer = `<script>window.__startupErrors=[];
addEventListener('error',e=>window.__startupErrors.push(e.message||'resource: '+e.target.src),true);
addEventListener('unhandledrejection',e=>window.__startupErrors.push(String(e.reason)));</script>`;

export async function startStaticServer(port = 1430) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const mount = url.pathname.startsWith('/play/') ? ['/play/', 'web-subpath']
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
