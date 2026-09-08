import { CONVERTER_VERSION, normalizeOptions, normalizeSource, issue } from './validation.js';
import { createTextCompiler } from './macroCompiler.js';
import { convertFields } from './fields.js';
import { convertWorldbook } from './worldbook.js';
import { convertAssets } from './assets.js';
import { generateScripts } from './cardScripts.js';
import { convertRegex } from './regex.js';

export function convertTavernCard({ source, resources = [], id, fingerprint = '', container = 'json', options: inputOptions = {} }) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('转换任务必须提供安全的新游戏卡 ID');
  const report = [];
  const data = normalizeSource(source, report);
  const options = normalizeOptions(inputOptions, 1 + data.alternate_greetings.length);
  const files = {};
  const compiler = createTextCompiler(report, files);
  const settings = convertFields(data, options, files, compiler, report);
  const worldbook = convertWorldbook(data, source.spec, files, compiler, report);
  const assets = convertAssets(data, resources, report);
  const regex = convertRegex(data, id, files, compiler, report);
  const variables = compiler.finish();
  generateScripts(files, !!worldbook, regex);
  const json = (path, value) => { files[path] = JSON.stringify(value, null, 2); };
  const card = { id, name: data.name, version: data.character_version || '1.0.0', author: data.creator,
    description: data.creator_notes, stateSchema: 'state/schema.json', files: { $import: 'files.json' },
    rules: [{ $import: 'rules/init.json' }, { $import: 'rules/prompt.json' },
      ...(regex.response ? [{ $import: 'rules/response.json' }] : [])],
    ...(regex.display ? { display: regex.display } : {}),
    ...(assets.visual ? { visual: assets.visual } : {}) };
  json('card.json', card);
  json('files.json', { tavern_settings: 'content/settings.json',
    tavern_content: { directory: 'content', include: ['*.md'] },
    ...(worldbook ? { worldbook: { directory: 'worldbook', include: ['config.json', 'entries/*.md'] } } : {}) });
  json('content/settings.json', settings);
  json('state/schema.json', { __tavern: { type: 'object', llmRead: false, llmWrite: false,
    default: { initialized: false, seed: '', character: data.nickname || data.name, user: options.userName, variables: {} } } });
  for (const [key, phase] of [['init', 'init'], ['prompt', 'pre_send'],
    ...(regex.response ? [['response', 'after_stream']] : [])]) {
    json(`rules/${key}.json`, { id: `tavern-${key}`, when: { phase },
      then: [{ type: 'exec', sourceFile: `scripts/${key}.js` }] });
  }
  issue(report, 'macro_profile', 'macros', '使用顺序求值的常见宏子集；不模拟旧引擎按宏类型分批替换或新引擎 scoped/if 语法', 'info');
  if (data.alternate_greetings.length) issue(report, 'greeting_selection', 'data.alternate_greetings', '保留全部候选，使用转换时所选开场白；尚无会话内 swipe 切换', 'info');
  json('import/original.json', source);
  json('import/report.json', report);
  json('import/manifest.json', { converterVersion: CONVERTER_VERSION, sourceSpec: source.spec,
    sourceVersion: source.spec_version, macroProfile: 'common-sequential-v1', fingerprint, container, options,
    variables, worldbook, regex: regex.mapping, assets: assets.mapping });
  if (Object.keys(files).length + assets.copies.length + (worldbook ? 16 : 0) > 4096) throw new Error('转换产物超过 4096 文件上限');
  if (Object.values(files).reduce((size, text) => size + text.length, 0) > 64 * 1024 * 1024) throw new Error('转换文本超过 64 MiB 限制');
  return { files, copies: assets.copies, worldbook: !!worldbook, report,
    summary: { id, name: data.name, creator: data.creator, notes: data.creator_notes,
      greetings: [data.first_mes, ...data.alternate_greetings], entries: worldbook?.mapping.length ?? 0,
      assets: assets.mapping.length, resources: assets.mapping.map(({ name, type, path }) => ({ name, type, path })) } };
}
