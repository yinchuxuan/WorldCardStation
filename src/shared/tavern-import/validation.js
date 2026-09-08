export const CONVERTER_VERSION = '1.1.0';
export const DEFAULT_OPTIONS = Object.freeze({
  userName: 'User', greetingIndex: 0, mainPrompt: '', postHistoryPrompt: ''
});
export const MAX_JSON_SIZE = 16 * 1024 * 1024;

export function issue(report, code, location, message, severity = 'warning') {
  if (report.length >= 4096) throw new Error('兼容报告超过 4096 项，请精简源卡');
  report.push({ severity, code, location, message });
}

export function object(value, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location} 必须是对象`);
  return value;
}

export function boundedJson(value) {
  const pending = [[value, 0]];
  let nodes = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (++nodes > 200000 || depth > 64) throw new Error('角色卡 JSON 结构过大或嵌套超过 64 层');
    if (item && typeof item === 'object') Object.values(item).forEach(child => pending.push([child, depth + 1]));
  }
  if (JSON.stringify(value).length > MAX_JSON_SIZE) throw new Error('角色卡 JSON 超过 16 MiB 限制');
}

export function stringList(value, location) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`${location} 必须是字符串数组`);
  return value;
}

export function normalizeSource(source, report) {
  boundedJson(source);
  object(source, '角色卡');
  if (!['chara_card_v2', 'chara_card_v3'].includes(source.spec)) throw new Error('只支持 V2/V3 酒馆角色卡');
  const data = { ...object(source.data, 'data') };
  if (typeof data.name !== 'string' || !data.name.trim()) throw new Error('data.name 必须是非空字符串');
  const strings = ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes',
    'system_prompt', 'post_history_instructions', 'creator', 'character_version'];
  for (const key of strings) {
    if (data[key] === undefined) {
      data[key] = '';
      issue(report, 'default_field', `data.${key}`, '缺失字段补为空文本', 'info');
    }
    if (typeof data[key] !== 'string') throw new Error(`data.${key} 必须是字符串`);
  }
  for (const key of ['tags', 'alternate_greetings', 'group_only_greetings', 'source']) {
    data[key] = stringList(data[key] ?? [], `data.${key}`);
  }
  if (data.nickname === null) {
    data.nickname = '';
    issue(report, 'default_field', 'data.nickname', 'null 昵称按未填写处理，使用角色名', 'info');
  }
  if (data.nickname !== undefined && typeof data.nickname !== 'string') throw new Error('data.nickname 必须是字符串');
  data.extensions = object(data.extensions ?? {}, 'data.extensions');
  if (source.spec_version !== undefined && typeof source.spec_version !== 'string') throw new Error('spec_version 必须是字符串');
  const version = source.spec.endsWith('v3') ? '3.0' : '2.0';
  if (source.spec_version !== version) issue(report, 'spec_version', 'spec_version', `按 ${version} 已知字段转换，源版本为 ${source.spec_version ?? '缺失'}`, source.spec_version === undefined ? 'info' : 'warning');
  if (!data.character_version) issue(report, 'default_version', 'data.character_version', '游戏卡内容版本使用 1.0.0', 'info');
  if (data.group_only_greetings.length) issue(report, 'group_chat', 'data.group_only_greetings', '群聊开场白仅归档，不用于单角色会话');
  reportExtensions(data.extensions, report);
  if (!data.character_book && data.extensions.world) issue(report, 'external_worldbook', 'data.extensions.world', '只有外部世界书名称，未读取酒馆安装目录；世界书内容缺失');
  return data;
}

function reportExtensions(extensions, report) {
  if (!Object.keys(extensions).length) return;
  issue(report, 'extensions_archived', 'data.extensions', '原始扩展已归档，不直接加载或执行', 'info');
  for (const [key, value] of Object.entries(extensions)) {
    if (['fav', 'talkativeness', 'world', 'regex_scripts'].includes(key)) continue;
    if (value === null || value === '' || value === false) continue;
    if (typeof value === 'object' && !Object.keys(value).length) continue;
    if (key === 'depth_prompt' && value && typeof value === 'object' && !value.prompt) continue;
    issue(report, 'extension_unsupported', `data.extensions.${key}`, '此扩展未转换，仅保留原始数据；其中的提示词、插件、正则脚本或自动化不会生效');
  }
}

export function normalizeOptions(input, greetingCount) {
  const options = { ...DEFAULT_OPTIONS, ...object(input ?? {}, '转换选项') };
  for (const key of ['userName', 'mainPrompt', 'postHistoryPrompt']) {
    if (typeof options[key] !== 'string' || options[key].length > 65536) throw new Error(`转换选项 ${key} 必须是限长文本`);
  }
  if (!options.userName.trim()) throw new Error('用户显示名不能为空');
  if (!Number.isInteger(options.greetingIndex) || options.greetingIndex < 0 || options.greetingIndex >= greetingCount) throw new Error('开场白索引无效');
  return options;
}
