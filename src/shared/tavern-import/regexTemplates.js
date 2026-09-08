import { parseTemplate } from './macroParser.js';
import { issue } from './validation.js';

export function regexTemplate(text, compiler, report, location, { captures = false, escapeRegex = false } = {}) {
  const parts = [];
  const literal = value => {
    if (!captures) { parts.push(value); return; }
    let end = 0;
    for (const match of value.matchAll(/\$(\d+)|\$<([^>]+)>/g)) {
      const capture = match[1] === undefined ? match[2] : Number(match[1]);
      parts.push(value.slice(end, match.index));
      if ((typeof capture === 'string' && capture.length <= 1000) || (Number.isInteger(capture) && capture <= 9999)) parts.push({ capture });
      end = match.index + match[0].length;
    }
    parts.push(value.slice(end));
  };
  for (const node of parseTemplate(text)) {
    if (node.text !== undefined) { literal(node.text); continue; }
    if (!node.unsupported && ['comment', '//', 'noop'].includes(node.name)) continue;
    if (!node.unsupported && node.argument === undefined) {
      if (node.name === 'newline') { parts.push('\n'); continue; }
      if (captures && node.name === 'match') { parts.push({ capture: 0 }); continue; }
      if (['char', 'user'].includes(node.name)) {
        parts.push({ state: `__tavern.${node.name === 'char' ? 'character' : 'user'}`, ...(escapeRegex ? { escapeRegex } : {}) });
        continue;
      }
    }
    if (!node.unsupported && node.name === 'getvar' && node.argument?.trim()
      && !node.argument.includes('{{') && !node.argument.includes('::')) {
      parts.push({ state: `__tavern.variables.${compiler.variable(node.argument.trim())}`, ...(escapeRegex ? { escapeRegex } : {}) });
      continue;
    }
    issue(report, 'regex_macro_unsupported', `${location}:${node.start}`, `正则中未支持的宏保持原文：${node.raw.slice(0, 120)}`);
    literal(node.raw);
  }
  if (parts.length > 512) throw Error('正则模板超过 512 片段');
  return parts.filter(part => part !== '');
}

export function regexExpression(parts, { captures = false, trims = [] } = {}) {
  if (typeof parts === 'string') return JSON.stringify(parts);
  parts = parts.parts ?? parts;
  const expressions = parts.map(part => {
    if (typeof part === 'string') return JSON.stringify(part);
    if (part.state) {
      const path = part.state.split('.').map(key => `?.[${JSON.stringify(key)}]`).join('');
      const value = `String(ctx.state${path} ?? '')`;
      return part.escapeRegex ? `tavernRegexEscape(${value})` : value;
    }
    if (!captures) return '""';
    const value = typeof part.capture === 'number'
      ? `(count>${part.capture}?groups[${part.capture}]:"")`
      : `(Object.hasOwn(named,${JSON.stringify(part.capture)})?named[${JSON.stringify(part.capture)}]:"")`;
    return trims.reduce((result, trim) => `${result}.split(${regexExpression(trim)}).join("")`, `String(${value} ?? "")`);
  });
  return `[${expressions.join(',')}].join("")`;
}
