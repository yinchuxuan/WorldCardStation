import { createServer } from 'node:http';

export async function startModelServer(port) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const allowed = !url.pathname.startsWith('/deny/');
    if (allowed) {
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
    }
    // Deliberately exclude credentials from test artifacts too.
    if (request.method === 'OPTIONS') {
      requests.push({ method: 'OPTIONS', path: url.pathname }); response.writeHead(204).end(); return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const config = JSON.parse(body || '{}');
    requests.push({ method: request.method, path: url.pathname, messages: config.messages });
    if (url.pathname.startsWith('/http-error/')) {
      response.writeHead(429, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: '测试限流，请重试' } })); return;
    }
    const slow = url.pathname.startsWith('/slow/');
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    response.flushHeaders();
    const text = url.pathname.startsWith('/pages/') ? '第一页的内容。\n\n第二页的内容。'
      : '你好，旅人。<state_patch>{"score":7}</state_patch>新的旅程开始了。';
    const anthropic = url.pathname.endsWith('/messages');
    let closed = false;
    response.on('close', () => { closed = true; });
    for (const content of text.match(/[\s\S]{1,5}/gu)) {
      if (closed) return;
      const data = anthropic ? { type: 'content_block_delta', delta: { type: 'text_delta', text: content } }
        : { choices: [{ delta: { content } }] };
      const bytes = Buffer.from(`data: ${JSON.stringify(data)}\n\n`);
      // Real network chunks, including split JSON and UTF-8 characters.
      response.write(bytes.subarray(0, 9));
      await new Promise(resolve => setTimeout(resolve, slow ? 100 : 5));
      if (closed) return;
      response.write(bytes.subarray(9));
    }
    response.end(anthropic ? 'event: message_stop\ndata: {"type":"message_stop"}\n\n' : 'data: [DONE]\n\n');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { requests, close: () => new Promise(resolve => server.close(resolve)) };
}
