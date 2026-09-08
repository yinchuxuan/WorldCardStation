import { issue, object } from './validation.js';

export function validateBookSettings(book) {
  for (const key of ['scan_depth', 'scanDepth', 'token_budget', 'tokenBudget']) {
    if (book[key] !== undefined && (!Number.isInteger(book[key]) || book[key] < 0)) throw new Error(`世界书 ${key} 必须是非负整数`);
  }
  for (const key of ['recursive_scanning', 'recursiveScanning']) {
    if (book[key] !== undefined && typeof book[key] !== 'boolean') throw new Error(`世界书 ${key} 必须是布尔值`);
  }
}

export function validateEntry(entry, location, report) {
  const extension = object(entry.extensions ?? {}, `${location}.extensions`);
  for (const container of [entry, extension]) {
    for (const key of ['enabled', 'disable', 'constant', 'selective', 'case_sensitive', 'caseSensitive', 'use_regex',
      'exclude_recursion', 'prevent_recursion', 'ignore_budget', 'useProbability', 'match_whole_words']) {
      if (container[key] !== undefined && container[key] !== null && typeof container[key] !== 'boolean') throw new Error(`${location}.${key} 必须是布尔值或 null`);
    }
    for (const key of ['insertion_order', 'order', 'priority', 'scan_depth', 'scanDepth', 'probability', 'depth',
      'sticky', 'cooldown', 'delay', 'group_weight', 'selectiveLogic']) {
      if (container[key] !== undefined && container[key] !== null && (typeof container[key] !== 'number' || !Number.isFinite(container[key]))) throw new Error(`${location}.${key} 必须是有限数值或 null`);
    }
  }
  const position = extension.position ?? entry.position;
  if ([2, 3].includes(position)) issue(report, 'authors_note_anchor', location, '没有导入作者注释预设锚点，这一位置的世界书条目不会插入');
  const supported = new Set(['activate', 'dont_activate', 'activate_only_after', 'activate_only_every',
    'keep_activate_after_match', 'dont_activate_after_match', 'depth', 'role', 'scan_depth', 'position',
    'additional_keys', 'exclude_keys', 'is_greeting']);
  for (const match of entry.content.matchAll(/^@{2,3}([a-z_]+)/gm)) {
    if (!supported.has(match[1])) issue(report, 'worldbook_decorator', location,
      `装饰器 ${match[1]} 缺少对应上下文或不支持，由世界书库忽略或采用后备行`);
  }
}
