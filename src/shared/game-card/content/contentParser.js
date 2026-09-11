function parseSource(expression, index) {
  if (!expression.startsWith('{{', index)) throw new Error('content source expected');

  let cursor = index + 2;
  let body = '';
  while (cursor < expression.length) {
    if (expression[cursor] === '\\') {
      body += expression.slice(cursor, cursor + 2);
      cursor += 2;
    } else if (expression.startsWith('}}', cursor)) {
      return { body, next: cursor + 2 };
    } else {
      body += expression[cursor];
      cursor += 1;
    }
  }
  throw new Error('content source is not closed');
}

function parseTransform(expression, index) {
  const match = expression.slice(index).match(/^\.([A-Za-z_][A-Za-z0-9_]*)\{/);
  if (!match) return null;

  let cursor = index + match[0].length;
  let args = '';
  let quote = null;
  while (cursor < expression.length) {
    const char = expression[cursor];
    if (char === '\\') {
      args += expression.slice(cursor, cursor + 2);
      cursor += 2;
    } else if (quote) {
      quote = char === quote ? null : quote;
      args += char;
      cursor += 1;
    } else if (char === '\'' || char === '"') {
      quote = char;
      args += char;
      cursor += 1;
    } else if (char === '}') {
      return { name: match[1], args: parseArgs(args), next: cursor + 1 };
    } else {
      args += char;
      cursor += 1;
    }
  }
  throw new Error(`transform is not closed: ${match[1]}`);
}

function parseArgs(argsText) {
  const args = {};
  const positional = argsText.trim().match(/^'((?:\\.|[^'])*)'$|^"((?:\\.|[^"])*)"$/);
  if (positional) {
    args.value = decodeArg(positional[1] !== undefined ? positional[1] : positional[2]);
    return args;
  }
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*('((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"|[0-9]+)/g;
  let match;
  while ((match = pattern.exec(argsText))) {
    const rawValue = match[3] !== undefined ? match[3] : match[4];
    args[match[1]] = rawValue !== undefined ? decodeArg(rawValue) : Number(match[2]);
  }
  return args;
}

function decodeArg(value) {
  return value.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
}

export { parseSource, parseTransform };
