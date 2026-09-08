// Import-time parser only. Unknown/scoped blocks remain opaque, including their children.
export function parseTemplate(text) {
  const nodes = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('{{', cursor);
    if (start < 0) { nodes.push({ text: text.slice(cursor), start: cursor }); break; }
    if (start > cursor) nodes.push({ text: text.slice(cursor, start), start: cursor });
    let depth = 1;
    let end = start + 2;
    while (end < text.length && depth) {
      const pair = text.slice(end, end + 2);
      if (pair === '{{') { depth += 1; end += 2; }
      else if (pair === '}}') { depth -= 1; end += 2; }
      else end += 1;
      if (depth > 32) throw new Error('宏嵌套超过 32 层');
    }
    if (depth) { nodes.push({ raw: text.slice(start), start, unsupported: true }); break; }
    const body = text.slice(start + 2, end - 2).trim();
    const match = /^(\/\/|[a-z_]+)(?:(::|:|\s+)\s*([\s\S]*))?$/i.exec(body);
    const name = match?.[1].toLowerCase();
    // Scoped syntax is a separately versioned engine; never execute its body partially.
    const close = name ? scopedEnd(text, name, end) : null;
    if (name === 'if' && !close) {
      nodes.push({ raw: text.slice(start), start, unsupported: true });
      break;
    }
    if (close) {
      nodes.push({ raw: text.slice(start, close), start, unsupported: true });
      cursor = close;
      continue;
    }
    nodes.push({ name, argument: match?.[3], separator: match?.[2], raw: text.slice(start, end), start, unsupported: !match });
    cursor = end;
    if (nodes.length > 4096) throw new Error('单个文本宏节点超过 4096 项');
  }
  return nodes;
}

function scopedEnd(text, name, start) {
  const escaped = name.replace(/\//g, '\\/');
  const tags = new RegExp(`\\{\\{\\s*(/?)${escaped}(?=\\s|:|\\}\\})`, 'ig');
  tags.lastIndex = start;
  let depth = 1;
  let match;
  while ((match = tags.exec(text))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      const end = text.indexOf('}}', tags.lastIndex);
      return end < 0 ? null : end + 2;
    }
  }
  return null;
}

export function splitArguments(text, separator = '::') {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.slice(index, index + 2) === '{{') { depth += 1; index += 1; }
    else if (text.slice(index, index + 2) === '}}') { depth -= 1; index += 1; }
    else if (!depth && text.startsWith(separator, index)) {
      parts.push(text.slice(start, index));
      index += separator.length - 1;
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

export function codeLiteral(value) {
  // Keep data inert even with the controlled Worker's conservative blocked-token check.
  return JSON.stringify(value).replace(/\b(Function|eval)\b/g, word => `\\u${word.charCodeAt(0).toString(16).padStart(4, '0')}${word.slice(1)}`)
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
