import { fileUrl } from './releaseIdentity.js';
import { validateManifest, releaseFiles } from './releaseManifest.js';
import { boundedBytes, checkAbort, downloadFile, runDownloads } from './download.js';
import { createCachedContext } from './cachedResources.js';

export async function prepareRelease(reference, dependencies, options = {}) {
  const { caches, records, fetch: request, estimate, urls } = dependencies;
  const { signal, onProgress = () => {} } = options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let context;
  try {
    checkAbort(signal);
    const previous = await records.get(reference.key);
    await records.put({ ...previous, ...reference, ready: false });
    checkAbort(signal);
    onProgress({ phase: 'checking', completedBytes: 0, totalBytes: 0 });
    const cache = await caches.open(reference.cacheName);
    const cachedManifest = await cache.match(reference.releaseUrl);
    const manifestResponse = cachedManifest || await request(reference.releaseUrl, {
      signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error'
    });
    const bytes = await boundedBytes(manifestResponse, 8 * 1024 * 1024, controller.signal);
    let manifest;
    try { manifest = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { if (cachedManifest) await cache.delete(reference.releaseUrl); throw new Error('发布清单不是有效 JSON'); }
    try { await validateManifest(manifest, reference); }
    catch (error) { if (cachedManifest) await cache.delete(reference.releaseUrl); throw error; }
    const record = { ...reference, contentFingerprint: manifest.contentFingerprint, ready: false };
    await records.put(record);
    if (!cachedManifest) await cache.put(reference.releaseUrl,
      new Response(bytes, { headers: { 'Content-Type': 'application/json' } }));
    const files = releaseFiles(manifest), missing = [];
    let completedBytes = 0;
    const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
    for (const file of files) {
      checkAbort(controller.signal);
      const cached = await cache.match(fileUrl(reference, file.path));
      if (cached?.ok && cached.headers.get('X-WCS-SHA256') === file.sha256
          && cached.headers.get('Content-Length') === String(file.bytes)) completedBytes += file.bytes;
      else missing.push(file);
    }
    let space;
    try { space = await estimate?.(); } catch { /* Estimation is optional; writes remain authoritative. */ }
    const remaining = totalBytes - completedBytes;
    if (remaining && Number.isFinite(space?.quota) && Number.isFinite(space?.usage)
        && space.quota - space.usage < remaining * 1.1) throw new Error('浏览器可用空间不足，请先清理空间或使用客户端');
    const progress = phase => onProgress({ phase, completedBytes, totalBytes, reusedReadyRecord: previous?.ready === true });
    progress('downloading');
    await runDownloads(missing, async file => {
      const url = fileUrl(reference, file.path);
      const downloaded = await downloadFile(url, file, { fetch: request, signal: controller.signal });
      checkAbort(controller.signal);
      await cache.put(url, downloaded);
      checkAbort(controller.signal);
      completedBytes += file.bytes; progress('downloading');
    }, controller);
    // IndexedDB and Cache Storage have no shared transaction. Recheck actual entries before ready.
    for (const file of files) {
      if (!await cache.match(fileUrl(reference, file.path))) throw new Error('缓存准备期间资源被移除，请重试');
    }
    progress('preloading');
    context = await createCachedContext(cache, manifest, reference, urls);
    checkAbort(controller.signal);
    await records.put({ ...record, ready: true });
    checkAbort(controller.signal);
    progress('ready');
    return context;
  } catch (error) {
    context?.dispose();
    if (error.name === 'QuotaExceededError') throw new Error('浏览器存储空间不足，资源未就绪；请清理空间后重试');
    throw error;
  } finally { signal?.removeEventListener('abort', abort); }
}
