import schema from '../../shared/game-card/schema/game-card.schema.json' assert { type: 'json' };
import packageInfo from '../../../package.json';
import { canonical, contentFingerprint, safeResourcePath, sha256 } from './releaseIdentity.js';

const MIB = 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const types = { json: 'application/json', js: 'text/javascript', jsx: 'text/javascript',
  md: 'text/plain', txt: 'text/plain', css: 'text/css', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4' };
function requireValue(condition, message) { if (!condition) throw new Error(`发布清单无效：${message}`); }
function exactKeys(value, keys) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(','), '字段结构错误');
}
function validateFile(file, cover = false) {
  exactKeys(file, ['path', 'bytes', 'sha256', 'mediaType']);
  safeResourcePath(file.path);
  requireValue(file.path !== 'release.json', '清单不能引用自身');
  requireValue(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= (cover ? 10 : 512) * MIB, '文件大小超限');
  requireValue(typeof file.sha256 === 'string' && HASH.test(file.sha256), '哈希格式错误');
  const extension = file.path.split('.').pop().toLowerCase();
  requireValue(file.mediaType === (types[extension] || 'application/octet-stream'), '文件类型错误');
  if (cover) requireValue(/^preview\/cover\.(png|jpg|jpeg|webp|gif|bmp)$/.test(file.path), '封面路径错误');
}
export async function validateManifest(value, reference) {
  exactKeys(value, ['formatVersion', 'cardId', 'cardVersion', 'releaseId', 'contentFingerprint',
    'schemaVersion', 'platformVersion', 'entry', 'name', 'description', 'files', 'cover']);
  requireValue(value.formatVersion === 1 && value.entry === 'card.json', '协议版本或入口不支持');
  requireValue(value.platformVersion === packageInfo.version && value.schemaVersion === schema['x-schema-version'], '平台版本不兼容');
  requireValue(value.cardId === reference.cardId && value.cardVersion === reference.cardVersion
    && value.releaseId === reference.releaseId, '发布身份不一致');
  requireValue(typeof value.name === 'string' && value.name.length > 0 && typeof value.description === 'string', '名称或简介错误');
  requireValue(Array.isArray(value.files) && value.files.length > 0 && value.files.length <= 4096, '文件数量超限');
  const paths = new Set();
  let previous = '', total = 0;
  for (const file of value.files) {
    validateFile(file);
    // Code-point ordering equals UTF-8 ordering (unlike JS UTF-16 ordering for astral characters).
    const ordered = [...file.path].map(c => c.codePointAt(0).toString(16).padStart(6, '0')).join('');
    requireValue(ordered > previous && !paths.has(file.path.toLowerCase()), '路径重复、大小写冲突或排序错误');
    previous = ordered; paths.add(file.path.toLowerCase()); total += file.bytes;
  }
  requireValue(value.files.some(f => f.path === 'card.json') && total <= 2048 * MIB, '缺少入口或总量超限');
  if (value.cover !== null) {
    validateFile(value.cover, true);
    requireValue(!paths.has(value.cover.path.toLowerCase()), '封面与资源冲突');
  }
  const { releaseId, ...body } = value;
  requireValue(`sha256-${await sha256(new TextEncoder().encode(canonical(body)))}` === releaseId, '发布摘要不符');
  requireValue(await contentFingerprint(value.files) === value.contentFingerprint, '内容指纹不符');
  return value;
}

export function releaseFiles(manifest) { return [...manifest.files, ...(manifest.cover ? [manifest.cover] : [])]; }
