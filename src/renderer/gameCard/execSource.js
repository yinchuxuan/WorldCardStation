function readSourceFile(filePath, options = {}) {
  if (options.fileContents && Object.prototype.hasOwnProperty.call(options.fileContents, filePath)) {
    return options.fileContents[filePath];
  }
  if (typeof options.readFile !== 'function') throw new Error('exec sourceFile requires preloaded content');
  const source = options.readFile(filePath);
  if (typeof source !== 'string') throw new Error(`exec file reader must return text: ${filePath}`);
  return source;
}

function normalizeCardPath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('exec include path is required');
  if (filePath.startsWith('/') || filePath.includes('\\')) throw new Error('exec include path must be relative');
  const parts = [];
  filePath.split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') {
      if (!parts.length) throw new Error('exec include path must stay inside game card directory');
      parts.pop();
    } else {
      parts.push(part);
    }
  });
  return parts.join('/');
}

function resolveExecIncludePath(parentPath, includePath) {
  if (includePath.startsWith('./') || includePath.startsWith('../')) {
    const parentParts = normalizeCardPath(parentPath).split('/');
    parentParts.pop();
    return normalizeCardPath([...parentParts, includePath].join('/'));
  }
  return normalizeCardPath(includePath);
}

function extractExecIncludes(source) {
  const pattern = /(?:^|\n)\s*include\(\s*(['"])([^'"]+)\1\s*\)\s*;?/g;
  const includes = [];
  let match;
  while ((match = pattern.exec(source))) includes.push(match[2]);
  return includes;
}

function stripExecIncludes(source) {
  return source.replace(/(?:^|\n)\s*include\(\s*(['"])([^'"]+)\1\s*\)\s*;?/g, '\n');
}

function resolveSourceWithIncludes(filePath, options, stack = []) {
  const normalizedPath = normalizeCardPath(filePath);
  if (stack.includes(normalizedPath)) throw new Error(`circular exec include: ${normalizedPath}`);
  if (stack.length > 20) throw new Error('exec include depth exceeded');
  const source = readSourceFile(normalizedPath, options);
  const nextStack = [...stack, normalizedPath];
  const includes = extractExecIncludes(source).map((includePath) => {
    return resolveSourceWithIncludes(resolveExecIncludePath(normalizedPath, includePath), options, nextStack);
  });
  return [...includes, stripExecIncludes(source)].join('\n');
}

function resolveExecSource(action, options = {}) {
  const hasSource = typeof action?.source === 'string';
  const hasSourceFile = typeof action?.sourceFile === 'string';
  if (hasSource && hasSourceFile) throw new Error('exec requires source or sourceFile, not both');
  if (hasSourceFile) return resolveSourceWithIncludes(action.sourceFile, options);
  if (hasSource) return action.source;
  throw new Error('exec requires source or sourceFile');
}

export { extractExecIncludes, resolveExecIncludePath, resolveExecSource };
