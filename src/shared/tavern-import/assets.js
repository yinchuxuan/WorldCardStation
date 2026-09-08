import { issue, object } from './validation.js';

const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

export function convertAssets(data, resources, report) {
  if (data.assets !== undefined && !Array.isArray(data.assets)) throw new Error('data.assets 必须是数组');
  const assets = data.assets ?? (resources.some(item => item.uri === 'ccdefault:')
    ? [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }] : []);
  const copies = [];
  const mapping = [];
  const visual = { background: {}, portrait: { character: {} } };
  assets.forEach((asset, index) => {
    const location = `data.assets.${index}`;
    object(asset, location);
    for (const key of ['type', 'uri', 'name', 'ext']) if (typeof asset[key] !== 'string') throw new Error(`${location}.${key} 必须是字符串`);
    const resource = resources.find(item => item.uri === asset.uri && (asset.uri !== 'ccdefault:' || asset.type === 'icon'));
    if (!resource) {
      issue(report, 'asset_unavailable', location, `资源 ${asset.name}（${asset.type}）未随卡携带、URI 不支持或超限；外部 URL 和本地路径不会自动读取`);
      return;
    }
    const ext = asset.uri === 'ccdefault:' ? 'png' : /^[a-z0-9]{1,10}$/.test(asset.ext) ? asset.ext : 'bin';
    const path = `assets/asset-${index + 1}.${ext}`;
    copies.push({ resourceId: resource.id, path });
    mapping.push({ ...asset, path });
    const key = `asset-${index + 1}`;
    if (asset.type === 'background' && IMAGE_TYPES.includes(ext)) visual.background[key] = path;
    else if (asset.type === 'emotion' && IMAGE_TYPES.includes(ext)) visual.portrait.character[key] = path;
    else issue(report, 'asset_archived', location, '资源仅归档，不自动显示头像、执行程序或播放媒体', 'info');
  });
  if (!Object.keys(visual.background).length) delete visual.background;
  if (!Object.keys(visual.portrait.character).length) delete visual.portrait;
  return { copies, mapping, visual: Object.keys(visual).length ? visual : undefined };
}
