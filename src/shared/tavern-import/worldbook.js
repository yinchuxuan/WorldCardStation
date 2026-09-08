import { issue, object, stringList } from './validation.js';
import { validateBookSettings, validateEntry } from './worldbookValidation.js';

export function safeName(value, fallback) {
  // eslint-disable-next-line no-control-regex
  const name = value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/[. ]+$/g, '').trim();
  return (name && !/^\.+$/.test(name) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)
    ? Array.from(name).slice(0, 60).join('') : fallback);
}

export function convertWorldbook(data, spec, output, compiler, report) {
  if (data.character_book === undefined) return null;
  const book = object(data.character_book, 'data.character_book');
  validateBookSettings(book);
  const rawEntries = book.entries;
  if (!Array.isArray(rawEntries) && (!rawEntries || typeof rawEntries !== 'object')) throw new Error('世界书 entries 必须是数组或对象');
  if (Object.keys(rawEntries).length > 3500) throw new Error('世界书超过 3500 条，无法在 4096 文件上限内安全转换');
  const st = !Array.isArray(rawEntries) || Object.values(rawEntries).some(entry => entry &&
    ('uid' in entry || 'key' in entry || Number.isInteger(entry.extensions?.position)
      || ['useProbability', 'selectiveLogic', 'group_weight', 'exclude_recursion'].some(key => key in (entry.extensions || {}))));
  const format = st ? 'sillytavern' : spec.endsWith('v3') ? 'v3' : 'v2';
  const ids = new Set();
  const filenames = new Set();
  const mapping = [];
  const entries = Object.entries(rawEntries).map(([sourceKey, input], index) => {
    const location = `data.character_book.entries.${sourceKey}`;
    object(input, location);
    const id = input.id ?? input.uid ?? (Array.isArray(rawEntries) ? `entry-${index + 1}` : sourceKey);
    if (!['number', 'string'].includes(typeof id) || typeof id === 'number' && !Number.isFinite(id)
      || String(id).length > 256 || !String(id)) throw new Error(`${location}.id 无效`);
    if (ids.has(String(id))) throw new Error(`世界书 ID 重复：${id}`);
    ids.add(String(id));
    if (typeof input.content !== 'string') throw new Error(`${location}.content 必须是字符串`);
    validateEntry(input, location, report);
    for (const key of ['keys', 'key', 'secondary_keys', 'keysecondary']) {
      if (input[key] !== undefined) stringList(input[key], `${location}.${key}`);
    }
    for (const key of ['name', 'comment']) {
      if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`${location}.${key} 必须是字符串`);
    }
    const base = safeName(input.name || input.comment || '', `条目-${index + 1}`);
    let filename = `${base}.md`;
    let suffix = 2;
    while (filenames.has(filename.toLowerCase())) filename = `${base}-${suffix++}.md`;
    filenames.add(filename.toLowerCase());
    output[`worldbook/entries/${filename}`] = input.content;
    const decoratorLine = /^(@{2,3})([a-z_]+)(?:[ \t]+(.*))?[ \t]*$/;
    const decorators = format === 'v2' ? [] : input.content.split(/\r?\n/).filter(line => decoratorLine.test(line));
    const body = !decorators.length ? input.content : input.content.split(/\r?\n/)
      .filter(line => !decoratorLine.test(line)).join('\n').replace(/^\n+|\n+$/g, '');
    compiler.compile(`entry:${id}:content`, body, { readOnly: true });
    ['keys', 'secondary_keys'].forEach((key, listIndex) => {
      (input[key] ?? input[listIndex ? 'keysecondary' : 'key'] ?? []).forEach((text, keyIndex) => {
        compiler.compile(`entry:${id}:${key}:${keyIndex}`, text, { readOnly: true });
      });
    });
    if (decorators.some(line => line.includes('{{'))) issue(report, 'decorator_macro', location, '装饰器内的动态宏不转换，按世界书库的装饰器规则处理');
    const extension = object(input.extensions ?? {}, `${location}.extensions`);
    if (extension.vectorized || input.vectorized || extension.automation_id || input.automation_id) {
      issue(report, 'worldbook_extension', location, '向量检索和自动化不执行；保留普通世界书匹配');
    }
    mapping.push({ id, sourceKey, file: `entries/${filename}` });
    return { ...input, id, content: '', extensions: { ...extension,
      world_card_station: { content_file: `entries/${filename}`, decorators } } };
  });
  const extension = object(book.extensions ?? {}, 'data.character_book.extensions');
  const anchors = Object.fromEntries(['description', 'personality', 'scenario', 'examples'].map(key => [key, `tavern:${key}`]));
  anchors.character = ['tavern:description', 'tavern:personality', 'tavern:scenario'];
  output['worldbook/config.json'] = JSON.stringify({ ...book, entries, extensions: { ...extension,
    world_card_station: { format, anchors } } }, null, 2);
  issue(report, 'worldbook_profile', 'data.character_book', `使用 ${format} 世界书语义及估算 token 预算；不迁移全局世界书设置`, 'info');
  return { mapping, format };
}
