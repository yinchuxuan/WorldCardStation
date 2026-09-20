import { sha256 } from './releaseIdentity.js';

export function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('下载已取消', 'AbortError');
}
export async function boundedBytes(response, limit, signal) {
  if (!response.ok) throw new Error(`资源下载失败（HTTP ${response.status}）`);
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    let finished = false;
    while (!finished) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      checkAbort(signal);
      finished = done;
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('资源实际大小超过清单限制');
      chunks.push(value);
    }
    const result = new Uint8Array(length);
    let offset = 0;
    chunks.forEach(chunk => { result.set(chunk, offset); offset += chunk.length; });
    return result;
  } finally { signal?.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function downloadFile(url, file, { fetch: request, signal }) {
  const response = await request(url, { signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
  const bytes = await boundedBytes(response, file.bytes, signal);
  if (bytes.length !== file.bytes || await sha256(bytes) !== file.sha256) throw new Error(`资源校验失败：${file.path}`);
  checkAbort(signal);
  return new Response(bytes, { headers: { 'Content-Type': file.mediaType,
    'Content-Length': String(file.bytes), 'X-WCS-SHA256': file.sha256 } });
}
export async function runDownloads(items, operation, controller, concurrency = 2) {
  let cursor = 0, failure;
  const worker = async () => {
    try {
      while (cursor < items.length) { checkAbort(controller.signal); await operation(items[cursor++]); }
    } catch (error) { failure ||= error; controller.abort(); }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failure) throw failure;
  checkAbort(controller.signal);
}
