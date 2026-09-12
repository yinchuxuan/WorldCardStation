import { includePattern, strippedSource } from './execSourceMap.js';
import { record } from '../../shared/game-card/trace/nodes.js';

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
  const pattern = includePattern();
  const includes = [];
  let match;
  while ((match = pattern.exec(source))) includes.push(match[2]);
  return includes;
}

function resolveSourceWithIncludes(filePath, options, stack = []) {
  const normalizedPath = normalizeCardPath(filePath);
  if (stack.includes(normalizedPath)) throw new Error(`circular exec include: ${normalizedPath}`);
  if (stack.length > 20) throw new Error('exec include depth exceeded');
  const source = readSourceFile(normalizedPath, options);
  record(options, 'resource.read', { file: normalizedPath, status: 'completed', characters: source.length, purpose: 'exec_source' });
  const nextStack = [...stack, normalizedPath];
  const includes = extractExecIncludes(source).map((includePath) => {
    return resolveSourceWithIncludes(resolveExecIncludePath(normalizedPath, includePath), options, nextStack);
  });
  const own = options.observer ? strippedSource(source, normalizedPath) : { source: source.replace(includePattern(), '\n') };
  const result = { source: [...includes.map(item => item.source), own.source].join('\n') };
  if (options.observer) result.lines = [...includes.flatMap(item => item.lines), ...own.lines];
  return result;
}

function resolveExecSource(action, options = {}) {
  const hasSource = typeof action?.source === 'string';
  const hasSourceFile = typeof action?.sourceFile === 'string';
  if (hasSource && hasSourceFile) throw new Error('exec requires source or sourceFile, not both');
  if (hasSourceFile) {
    const result = resolveSourceWithIncludes(action.sourceFile, options);
    record(options, 'exec.source', { file: action.sourceFile, lines: result.lines });
    return result.source;
  }
  if (hasSource) return action.source;
  throw new Error('exec requires source or sourceFile');
}

export { extractExecIncludes, normalizeCardPath, resolveExecIncludePath, resolveExecSource };
