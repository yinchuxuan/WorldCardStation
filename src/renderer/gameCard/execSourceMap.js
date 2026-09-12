function includePattern() {
  return /(?:^|\n)\s*include\(\s*(['"])([^'"]+)\1\s*\)\s*;?/g;
}

// Preserve the exact existing include stripping, while mapping retained lines to the original file.
function strippedSource(source, file) {
  let cursor = 0, originalLine = 1, generatedLine = 1, output = '';
  const lines = [];
  const append = (text, line) => {
    for (const char of text) {
      if (char !== '\n' || !lines[generatedLine - 1]) lines[generatedLine - 1] = { file, line };
      output += char;
      if (char === '\n') { generatedLine += 1; line += 1; }
    }
  };
  for (const match of source.matchAll(includePattern())) {
    const kept = source.slice(cursor, match.index);
    append(kept, originalLine);
    originalLine += (kept.match(/\n/g) || []).length;
    originalLine += (match[0].match(/\n/g) || []).length;
    append('\n', originalLine);
    cursor = match.index + match[0].length;
  }
  append(source.slice(cursor), originalLine);
  lines[generatedLine - 1] ||= { file, line: originalLine + source.slice(cursor).split('\n').length - 1 };
  return { source: output, lines };
}

export { includePattern, strippedSource };
