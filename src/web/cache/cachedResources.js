import { fileUrl, safeResourcePath } from './releaseIdentity.js';
import { validateGameCard } from '../../shared/game-card/schema/validateGameCard.js';
import { collectSchemaFileReferences } from '../../shared/game-card/schema/schemaFileReferences.js';
import { loadCachedCardResources } from '../../renderer/gameCard/gameCardRuntimeCache.js';

export async function createCachedContext(cache, manifest, reference, urls = URL) {
  const files = new Map(manifest.files.map(file => [file.path, file]));
  let disposed = false, card;
  const objectUrls = new Map();
  function alive() { if (disposed) throw new Error('游戏资源已释放，请重新准备'); }
  async function response(path) {
    alive(); safeResourcePath(path);
    const file = files.get(path);
    if (!file) throw new Error(`资源未获授权：${path}`);
    const result = await cache.match(fileUrl(reference, path));
    alive();
    if (!result || result.headers.get('X-WCS-SHA256') !== file.sha256
        || result.headers.get('Content-Length') !== String(file.bytes)) {
      if (objectUrls.has(path)) { urls.revokeObjectURL(objectUrls.get(path)); objectUrls.delete(path); }
      throw new Error(`本地资源缺失，请重新检查并补齐缓存：${path}`);
    }
    return result;
  }
  function authorize(id, path, type) {
    alive();
    if (id !== card.id) throw new Error('资源不属于当前游戏卡');
    const file = files.get(path);
    if (!file || (type === 'text' ? !/^(text\/|application\/json$)/.test(file.mediaType)
      : !file.mediaType.startsWith(`${type}/`))) throw new Error(`资源类型不匹配：${path}`);
    if (type !== 'text') {
      const references = collectSchemaFileReferences(type === 'image' ? { visual: card.visual } : { audio: card.audio });
      if (!references.some(item => item.file === path)) throw new Error(`媒体未获授权：${path}`);
    }
  }
  async function media(id, path, type) {
    authorize(id, path, type);
    const cached = await response(path);
    if (objectUrls.has(path)) return objectUrls.get(path);
    const blob = await cached.blob();
    alive();
    // Recheck after await to avoid leaking duplicate URLs from simultaneous reads.
    if (!objectUrls.has(path)) objectUrls.set(path, urls.createObjectURL(blob));
    return objectUrls.get(path);
  }
  const resources = {
    async readText(id, path) {
      authorize(id, path, 'text'); const text = await (await response(path)).text(); alive(); return text;
    },
    getImageUrl: (id, path) => media(id, path, 'image'),
    getAudioUrl: (id, path) => media(id, path, 'audio')
  };
  function dispose() { disposed = true; objectUrls.forEach(url => urls.revokeObjectURL(url)); objectUrls.clear(); }
  try {
    card = await (await response('card.json')).json();
    const validation = validateGameCard(card);
    if (!validation.valid) throw new Error(`游戏卡配置无效：${validation.errors.join('; ')}`);
    if (card.id !== reference.cardId || card.version !== reference.cardVersion) throw new Error('游戏卡与发布身份不一致');
    for (const item of collectSchemaFileReferences(card)) {
      if (!files.has(item.file)) throw new Error(`清单缺少已声明资源：${item.file}`);
    }
    const preloaded = await loadCachedCardResources(card, resources);
    alive();
    return { card, reference, resources, preloaded, dispose };
  } catch (error) { dispose(); throw error; }
}
