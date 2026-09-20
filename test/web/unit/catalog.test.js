import { parseCatalog, loadCatalog } from '../../../src/web/catalog.js';

const base = new URL('https://example.test/play/cards/');
const releaseId = `sha256-${'a'.repeat(64)}`;
const entry = { cardId: 'demo', cardVersion: '1.0', releaseId, name: '测试', description: '描述',
  release: `demo/${releaseId}/release.json`, cover: `demo/${releaseId}/preview/cover.png` };
const catalog = cards => ({ formatVersion: 1, cards });

test('catalog resolves only trusted paths and retains fixed release identity', () => {
  const [card] = parseCatalog(catalog([entry]), base);
  expect(card.releaseUrl).toBe(`${base.href}${entry.release}`);
  expect(card.coverUrl).toBe(`${base.href}${entry.cover}`);
  expect(parseCatalog(catalog([{ ...entry, cover: null }]), base)[0].coverUrl).toBeNull();
  expect(parseCatalog(catalog([]), base)).toEqual([]);
});

test.each([
  null, {}, { formatVersion: 2, cards: [] }, catalog([entry, entry]), catalog([null]),
  ...[{ cardId: '../bad' }, { releaseId: '1.0' }, { name: '' }, { cardVersion: '' },
    { description: null }, { release: 'https://evil.test/release.json' },
    { cover: `demo/${releaseId}/preview/cover.%2e.png` },
    { cover: `demo/${releaseId}/preview/cover.x/../a.png` },
    { cover: `demo/${releaseId}/preview/cover.a\\b.png` },
    { cover: 'data:image/png;base64,abc' }, { cover: undefined }]
    .map(change => catalog([{ ...entry, ...change }]))
])('rejects malformed or unsafe catalog %#', value => {
  expect(() => parseCatalog(value, base)).toThrow(/游戏目录无效/);
});

test('list browsing requests index only and disallows redirects', async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true,
    headers: { get: () => 'application/json; charset=utf-8' }, json: async () => catalog([entry]) });
  const controller = new AbortController();
  expect(await loadCatalog(base, { fetch, signal: controller.signal })).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(`${base.href}index.json`, expect.objectContaining({
    signal: controller.signal, cache: 'no-cache', credentials: 'omit', redirect: 'error'
  }));
  fetch.mockResolvedValue({ ok: false, status: 404 });
  await expect(loadCatalog(base, { fetch })).rejects.toThrow('HTTP 404');
  fetch.mockRejectedValue(new Error('network unavailable'));
  await expect(loadCatalog(base, { fetch })).rejects.toThrow('network unavailable');
});

test('reports unconfigured, non-JSON and damaged catalogs without raw parser errors', async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
  await expect(loadCatalog(base, { fetch })).rejects.toThrow('游戏目录尚未配置');
  const json = jest.fn().mockRejectedValue(new SyntaxError("Unexpected token '<'"));
  fetch.mockResolvedValue({ ok: true, headers: { get: () => 'text/html' }, json });
  await expect(loadCatalog(base, { fetch })).rejects.toThrow('返回的不是 JSON');
  expect(json).not.toHaveBeenCalled();
  fetch.mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json });
  await expect(loadCatalog(base, { fetch })).rejects.toThrow('JSON 无法解析');
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  json.mockRejectedValue(abort);
  await expect(loadCatalog(base, { fetch })).rejects.toBe(abort);
});
