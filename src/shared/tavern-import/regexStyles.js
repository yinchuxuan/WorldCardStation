import { issue } from './validation.js';

function blocks(css, render) {
  let result = '', start = 0, depth = 0, header = '', body = 0, quote = '';
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') {
      if (depth === 0) { header = css.slice(start, index).trim(); body = index + 1; }
      depth += 1;
    } else if (char === '}') {
      if (--depth < 0) throw Error('CSS 括号不匹配');
      if (depth === 0) { result += render(header, css.slice(body, index)); start = index + 1; }
    }
  }
  if (depth || quote || css.slice(start).trim()) throw Error('不支持的 CSS 结构');
  return result;
}

function scopedCss(css, scope) {
  return blocks(css, (header, body) => {
    if (/^@(?:-webkit-)?keyframes\s+[\w-]+$/i.test(header)) return `${header}{${body}}\n`;
    if (/^@(?:media|supports)\s/i.test(header)) return `${header}{${scopedCss(body, scope)}}\n`;
    if (!header || /[@;{}]/.test(header)) throw Error('不支持的 CSS 指令');
    // Functional selectors containing commas need a full selector parser, not a naive split.
    if (/\([^)]*,/.test(header)) throw Error('暂不支持包含逗号的函数选择器');
    const selectors = header.split(',').map(selector => `${scope} ${selector.trim().replace(/^(?:html|body|:root)(?=$|[\s.#[:])/i, '').trim()}`.trim());
    return `${selectors.join(',')}{${body}}\n`;
  });
}

export function extractRegexStyles(text, id, index, report, styles) {
  const namespace = `gc-${id}-r${index}`;
  const renames = new Map();
  const output = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, raw) => {
    try {
      let css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      if (/[\\<>]|\{\{|\$\d|\$<|url\s*\(|@import|@font-face|expression\s*\(/i.test(css)) throw Error('动态或外部 CSS 不加载');
      for (const match of css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/gi)) renames.set(match[1], `${namespace}-${match[1]}`);
      for (const [from, to] of renames) css = css.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
      styles.push(scopedCss(css, `.game-card-theme-${id.toLowerCase()} [data-gc-part="message-content"]`));
    } catch (error) {
      issue(report, 'regex_style_unsupported', `data.extensions.regex_scripts[${index}].replaceString`, `样式已移除：${error.message}`);
    }
    return '';
  });
  // Rename only animation declaration values, never narrative text or capture placeholders.
  const safeOutput = output.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (attribute, quote, value) => {
    if (/[\\&<>]|expression\s*\(/i.test(value)) {
      issue(report, 'regex_style_unsupported', `data.extensions.regex_scripts[${index}].replaceString`, '动态或转义的内联样式已移除');
      return '';
    }
    if (!/url\s*\(/i.test(value)) return attribute;
    issue(report, 'regex_style_unsupported', `data.extensions.regex_scripts[${index}].replaceString`, 'CSS URL 已移除，保留其他内联样式');
    return `style=${quote}${value.replace(/url\s*\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi, 'none')}${quote}`;
  });
  return safeOutput.replace(/(animation(?:-name)?\s*:\s*)([^;"<>]+)/gi, (_, property, value) => {
    for (const [from, to] of renames) value = value.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
    return property + value;
  });
}
