import { issue } from './validation.js';
import { normalizeRegex } from './regexValidation.js';
import { regexTemplate } from './regexTemplates.js';
import { extractRegexStyles } from './regexStyles.js';
import { generateRegexScripts } from './regexScripts.js';

export function convertRegex(data, id, files, compiler, report) {
  const source = data.extensions.regex_scripts;
  const location = 'data.extensions.regex_scripts';
  if (source === undefined || source === null) return { mapping: [], persistent: false };
  if (!Array.isArray(source)) {
    issue(report, 'regex_invalid', location, '正则扩展不是数组，仅归档');
    return { mapping: [], persistent: false };
  }
  if (source.length > 500) throw Error('正则规则超过 500 条');
  const display = {}, persistent = [], mapping = [], styles = [];
  source.forEach((raw, index) => {
    const at = `${location}[${index}]`;
    const item = { index, sourceId: raw?.id, name: raw?.scriptName, status: 'skipped' };
    mapping.push(item);
    if (raw?.disabled === true) { item.status = 'disabled'; return; }
    try {
      const rule = normalizeRegex(raw);
      const roles = rule.placement.filter(value => [1, 2].includes(value)).map(value => value === 1 ? 'user' : 'assistant');
      const unsupported = rule.placement.filter(value => ![1, 2].includes(value));
      if (unsupported.length || !roles.length) issue(report, 'regex_placement_unsupported', `${at}.placement`, `仅支持用户输入/AI 输出；未转换位置：${unsupported.join(',') || '空'}`);
      if (!roles.length) return;
      if ((rule.mode === 'display' && roles.some(role => (display[role]?.length ?? 0) >= 50))
        || (rule.mode !== 'display' && persistent.length >= 50)) throw Error('每类最多支持 50 条启用规则');
      const pattern = rule.substitute === 0 ? rule.pattern : regexTemplate(rule.pattern, compiler, report, `${at}.findRegex`, { escapeRegex: rule.substitute === 2 });
      // Dynamic state values are checked again at execution time; validate the literal structure here.
      const sample = Array.isArray(pattern) ? pattern.map(part => typeof part === 'string' ? part : 'x').join('') : pattern;
      new RegExp(sample, rule.flags);
      const ruleStyles = [];
      const text = extractRegexStyles(rule.replace, id, index, report, ruleStyles);
      const replace = regexTemplate(text, compiler, report, `${at}.replaceString`, { captures: true });
      const trimStrings = rule.trim.map((text, trimIndex) => ({
        parts: regexTemplate(text, compiler, report, `${at}.trimStrings[${trimIndex}]`)
      }));
      const normalized = { id: `regex-${index}`, pattern, flags: rule.flags, replace,
        ...(trimStrings.length ? { trimStrings } : {}),
        ...(rule.minDepth === undefined ? {} : { minDepth: rule.minDepth }),
        ...(rule.maxDepth === undefined ? {} : { maxDepth: rule.maxDepth }) };
      if (rule.mode === 'display') {
        for (const role of roles) (display[role] ??= []).push({ ...normalized, stage: 'before_markdown', type: 'regex_replace' });
      } else persistent.push({ ...normalized, roles, mode: rule.mode, runOnEdit: rule.runOnEdit });
      styles.push(...ruleStyles);
      Object.assign(item, { status: 'converted', target: rule.mode, roles, id: normalized.id });
    } catch (error) {
      issue(report, 'regex_invalid', at, `规则未转换：${error.message}`);
    }
  });
  if (styles.length) { files['assets/regex.css'] = styles.join('\n'); display.stylesheet = 'assets/regex.css'; }
  generateRegexScripts(files, persistent);
  if (persistent.length) issue(report, 'regex_unified_messages', location,
    '正则直接修改 messages 并保存，不保留原文；同一规则首次满足条件时执行，世界书扫描使用修改后的历史', 'info');
  return { display: Object.keys(display).length ? display : undefined, mapping, persistent: persistent.length > 0,
    response: persistent.some(rule => rule.roles.includes('assistant') && rule.mode !== 'prompt') };
}
