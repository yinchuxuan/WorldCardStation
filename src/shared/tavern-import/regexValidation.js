export function parseRegex(value) {
  if (typeof value !== 'string' || !value) throw Error('findRegex 必须是非空字符串');
  let pattern = value, flags = '';
  if (value.startsWith('/')) {
    const end = value.lastIndexOf('/');
    if (end > 0) { pattern = value.slice(1, end); flags = value.slice(end + 1); }
  }
  if (pattern.length > 1000) throw Error('表达式超过 1000 字符');
  if (!/^[gimsu]*$/.test(flags) || new Set(flags).size !== flags.length) throw Error('只支持不重复的 g/i/m/s/u flags');
  return { pattern, flags };
}

export function normalizeRegex(rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw Error('规则必须是对象');
  const parsed = parseRegex(rule.findRegex);
  for (const key of ['disabled', 'markdownOnly', 'promptOnly', 'runOnEdit']) {
    if (rule[key] !== undefined && rule[key] !== null && typeof rule[key] !== 'boolean') throw Error(`${key} 必须是布尔值`);
  }
  if (rule.replaceString !== undefined && rule.replaceString !== null && typeof rule.replaceString !== 'string') throw Error('replaceString 必须是字符串');
  if (!Array.isArray(rule.placement) || rule.placement.some(value => !Number.isInteger(value))) throw Error('placement 必须是整数数组');
  const trim = rule.trimStrings ?? [];
  if (!Array.isArray(trim) || trim.length > 64 || trim.some(value => typeof value !== 'string' || value.length > 1000)) throw Error('trimStrings 必须是最多 64 项的限长字符串数组');
  const depth = {};
  for (const key of ['minDepth', 'maxDepth']) {
    const value = rule[key];
    if (value === undefined || value === null || value === -1) continue;
    if (!Number.isInteger(value) || value < 0) throw Error(`${key} 必须是非负整数或 null`);
    depth[key] = value;
  }
  if (depth.minDepth > depth.maxDepth) throw Error('minDepth 不得大于 maxDepth');
  const substitute = rule.substituteRegex ?? 0;
  if (![0, 1, 2].includes(substitute)) throw Error('substituteRegex 只支持 0/1/2');
  const replace = rule.replaceString ?? '';
  if (replace.length > 100000) throw Error('替换文本超过 100000 字符');
  return { ...parsed, ...depth, replace, trim, substitute,
    placement: [...new Set(rule.placement)], runOnEdit: rule.runOnEdit === true,
    mode: rule.promptOnly ? (rule.markdownOnly ? 'both' : 'prompt') : rule.markdownOnly ? 'display' : 'source' };
}
