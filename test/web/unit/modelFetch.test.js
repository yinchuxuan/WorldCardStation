/** @jest-environment node */
import { modelFetch } from '../../../src/web/modelFetch.js';
import { readSSEStream } from '../../../src/renderer/chat/apiClient.js';

const encoder = new TextEncoder();
const stream = text => new Response(new ReadableStream({ start(controller) {
  for (const byte of encoder.encode(text)) controller.enqueue(new Uint8Array([byte]));
  controller.close();
} }));
test.each([
  ['openai', 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n'],
  ['anthropic', 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n']
])('real fetch stream parses byte-split %s UTF-8 SSE', async (protocol, text) => {
  const fetch = jest.fn().mockResolvedValue(stream(text));
  const response = await modelFetch('https://model.test/v1/messages', {
    headers: protocol === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {}
  }, { fetch });
  const onToken = jest.fn();
  await readSSEStream(response.body.getReader(), protocol, { onToken });
  expect(onToken).toHaveBeenCalledWith('你好');
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
  expect(fetch.mock.calls[0][1].headers.has('anthropic-dangerous-direct-browser-access')).toBe(protocol === 'anthropic');
});
test('HTTP error body is preserved; network/CORS failure is actionable', async () => {
  const response = await modelFetch('https://model.test', {}, { fetch: async () => new Response('denied', { status: 401 }) });
  expect(response.status).toBe(401); expect(await response.text()).toBe('denied');
  await expect(modelFetch('https://model.test', {}, { fetch: async () => { throw new TypeError('fetch'); } })).rejects.toThrow('网络或跨域');
  await expect(modelFetch('file:///tmp/key')).rejects.toThrow('HTTP(S)');
});
const waitingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
});
test('header deadline and user cancellation are distinguished', async () => {
  await expect(modelFetch('https://model.test', {}, { fetch: waitingFetch, timeoutMs: 5 })).rejects.toThrow('超时');
  const controller = new AbortController();
  const pending = modelFetch('https://model.test', { signal: controller.signal }, { fetch: waitingFetch });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await expect(modelFetch('https://model.test', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
});
test('deadline remains active while consuming body and cancellation closes transport', async () => {
  let aborted = false;
  const fetch = async (_url, { signal }) => new Response(new ReadableStream({ start(controller) {
    signal.addEventListener('abort', () => { aborted = true; controller.error(new Error('aborted')); });
  } }));
  const response = await modelFetch('https://model.test', {}, { fetch, timeoutMs: 5 });
  await expect(response.text()).rejects.toThrow('超时');
  expect(aborted).toBe(true);
  const second = await modelFetch('https://model.test', {}, { fetch });
  await second.body.cancel();
});
