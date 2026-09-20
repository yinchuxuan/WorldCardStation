const DEFAULT_TIMEOUT_MS = 120000;

// The deadline covers response headers AND the stream, not just fetch().
export async function modelFetch(url, options = {}, dependencies = {}) {
  const endpoint = new URL(url);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('模型地址必须是无内嵌凭据的 HTTP(S) URL');
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(options.signal.reason);
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
  const failure = error => {
    if (timedOut) return new Error('模型请求超时，请重试');
    if (options.signal?.aborted) return new DOMException('请求已取消', 'AbortError');
    return error instanceof TypeError ? new Error('网络或跨域访问失败，请检查模型地址及服务端 CORS 配置') : error;
  };
  if (options.signal?.aborted) { cleanup(); throw failure(options.signal.reason); }
  options.signal?.addEventListener('abort', abort, { once: true });
  const headers = new Headers(options.headers);
  if (headers.has('anthropic-version')) headers.set('anthropic-dangerous-direct-browser-access', 'true');
  try {
    const response = await (dependencies.fetch || globalThis.fetch)(endpoint.href, {
      ...options, headers, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store'
    });
    if (!response.body) { cleanup(); return response; }
    const reader = response.body.getReader();
    const body = new ReadableStream({
      async pull(stream) {
        try {
          const { done, value } = await reader.read();
          if (done) { cleanup(); reader.releaseLock(); stream.close(); }
          else stream.enqueue(value);
        } catch (error) { cleanup(); reader.releaseLock(); stream.error(failure(error)); }
      },
      async cancel(reason) {
        cleanup(); controller.abort();
        try { await reader.cancel(reason); } catch { /* Abort may already have errored the reader. */ }
        finally { reader.releaseLock(); }
      }
    });
    const result = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    // Parsing or a token callback may fail before EOF. Do not leave the HTTP stream running.
    result.dispose = () => { cleanup(); controller.abort(); };
    return result;
  } catch (error) { cleanup(); throw failure(error); }
}
