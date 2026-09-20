import { open, realpath } from 'node:fs/promises';
import path from 'node:path';

const types = {
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
  '.js': 'text/javascript', '.jsx': 'text/javascript', '.css': 'text/css',
  '.md': 'text/plain', '.txt': 'text/plain', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4'
};

// Run before Vite's SPA fallback: a missing catalog must remain a real 404.
export function webCardServer(directory) {
  return {
    name: 'web-published-cards',
    apply: 'serve',
    configureServer(server) {
      const base = server.config.base === './' ? '/' : server.config.base;
      const prefix = `${base}cards/`;
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url.split('?')[0];
        if (!pathname.startsWith(prefix)) return next();
        let file;
        try {
          if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
          }
          const relative = decodeURIComponent(pathname.slice(prefix.length));
          if (/[\\:%?#]/.test(relative) || [...relative].some(c => c.charCodeAt(0) < 32)
              || relative.split('/').some(part => !part || part.startsWith('.'))) throw new Error('Unsafe path');
          const root = await realpath(directory);
          const target = await realpath(path.join(root, relative));
          if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Outside published directory');
          file = await open(target, 'r');
          const stat = await file.stat();
          if (!stat.isFile()) throw new Error('Not a file');
          response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream',
            'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          if (request.method === 'HEAD') { await file.close(); response.end(); return; }
          const stream = file.createReadStream();
          stream.on('error', () => response.destroy());
          response.on('close', () => stream.destroy());
          stream.pipe(response);
        } catch {
          await file?.close();
          response.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            .end(JSON.stringify({ error: 'Published card file not found' }));
        }
      });
    }
  };
}
