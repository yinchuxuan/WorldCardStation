const ID = /^[a-zA-Z0-9_-]+$/;
const RELEASE = /^sha256-[a-f0-9]{64}$/;

function fail(message) { throw new Error(`游戏目录无效：${message}`); }

function resourceUrl(relative, base) {
  if (typeof relative !== 'string' || /[\\:%?#]/.test(relative) || [...relative].some(c => c.charCodeAt(0) < 32)
      || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('资源路径不安全');
  const url = new URL(relative.split('/').map(encodeURIComponent).join('/'), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) fail('资源超出托管目录');
  return url.href;
}

function parseCatalog(value, base) {
  if (value?.formatVersion !== 1 || !Array.isArray(value.cards)) fail('不支持的索引格式');
  const ids = new Set();
  return value.cards.map(card => {
    if (!card || typeof card.cardId !== 'string' || !ID.test(card.cardId)
        || typeof card.releaseId !== 'string' || !RELEASE.test(card.releaseId)
        || typeof card.name !== 'string' || !card.name.trim()
        || typeof card.cardVersion !== 'string' || !card.cardVersion
        || typeof card.description !== 'string' || ids.has(card.cardId)) fail('卡片元数据错误或重复');
    ids.add(card.cardId);
    const prefix = `${card.cardId}/${card.releaseId}/`;
    if (card.release !== `${prefix}release.json`) fail('发布地址与身份不一致');
    if (card.cover !== null && (typeof card.cover !== 'string'
        || !card.cover.startsWith(`${prefix}preview/cover.`)
        || !/\.(png|jpg|jpeg|webp|gif|bmp)$/.test(card.cover))) fail('封面路径错误');
    return { ...card, releaseUrl: resourceUrl(card.release, base),
      coverUrl: card.cover === null ? null : resourceUrl(card.cover, base) };
  });
}

async function loadCatalog(base, { signal, fetch: request = globalThis.fetch } = {}) {
  const response = await request(new URL('index.json', base).href, {
    signal, cache: 'no-cache', credentials: 'omit', redirect: 'error'
  });
  if (response.status === 404) throw new Error('游戏目录尚未配置（HTTP 404），请先发布游戏卡并配置 cards/ 目录。');
  if (!response.ok) throw new Error(`游戏目录加载失败（HTTP ${response.status}）`);
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
    throw new Error('游戏目录返回的不是 JSON，请检查 cards/index.json 的发布路径和服务器配置。');
  }
  let value;
  try { value = await response.json(); } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('游戏目录 JSON 无法解析，请检查 cards/index.json 是否完整。');
  }
  return parseCatalog(value, base);
}

export { parseCatalog, loadCatalog };
