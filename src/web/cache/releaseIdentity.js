import { parseCatalog } from '../catalog.js';

const encode = value => new TextEncoder().encode(value);
export async function sha256(bytes) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function safeResourcePath(value) {
  if (typeof value !== 'string' || !value || /[\\:%?#]/.test(value)
      || [...value].some(c => c.charCodeAt(0) < 32)
      || value.split('/').some(p => !p || p.startsWith('.') || /[. ]$/.test(p))) {
    throw new Error(`不安全的资源路径：${value}`);
  }
  return value;
}
export function fileUrl(reference, path) {
  return new URL(safeResourcePath(path).split('/').map(encodeURIComponent).join('/'), reference.baseUrl).href;
}
export async function createReference(entry, source) {
  const base = new URL(source);
  if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash
      || base.username || base.password || !base.pathname.endsWith('/')) throw new Error('发布来源无效');
  const [card] = parseCatalog({ formatVersion: 1, cards: [entry] }, base);
  const sourceId = await sha256(encode(base.href));
  return { sourceId, sourceUrl: base.href, cardId: card.cardId, cardVersion: card.cardVersion,
    releaseId: card.releaseId, releaseUrl: card.releaseUrl, baseUrl: new URL('./', card.releaseUrl).href,
    key: JSON.stringify([base.href, card.cardId, card.releaseId]),
    cacheName: `wcs-card-v1-${sourceId}-${card.cardId}-${card.releaseId}` };
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function contentFingerprint(files) {
  const parts = [encode('wcs-content-v1\0')];
  const integer = value => { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigUint64(0, BigInt(value)); return bytes; };
  for (const file of files) {
    const path = encode(file.path);
    parts.push(integer(path.length), path, integer(file.bytes), encode(file.sha256));
  }
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  parts.forEach(part => { bytes.set(part, offset); offset += part.length; });
  return `wcs-content-v1-${await sha256(bytes)}`;
}
