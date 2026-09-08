import { extractExecIncludes, resolveExecIncludePath } from './execSource.js';
import { resolveRegisteredTextPath } from '../../shared/game-card/content/fileScopes.js';

function collectContentFilePaths(card, paths) {
  Object.values(card?.files || {}).forEach((filePath) => {
    if (typeof filePath === 'string') paths.add(filePath);
  });
}

function collectExecSourceFiles(value, paths) {
  if (Array.isArray(value)) return value.forEach((item) => collectExecSourceFiles(item, paths));
  if (!value || typeof value !== 'object') return;
  if (value.type === 'exec' && typeof value.sourceFile === 'string') paths.add(value.sourceFile);
  Object.values(value).forEach((item) => collectExecSourceFiles(item, paths));
}

function collectScopedContentFiles(value, card, paths) {
  if (Array.isArray(value)) {
    value.forEach(item => collectScopedContentFiles(item, card, paths));
    return;
  }
  if (typeof value === 'string') {
    const pattern = /\{\{file:([^}]+)\}\}/g;
    let match;
    while ((match = pattern.exec(value))) {
      const fileRef = match[1].split('#', 1)[0].trim();
      if (fileRef.startsWith('$')) continue;
      const filePath = resolveRegisteredTextPath(card, fileRef);
      if (filePath) paths.add(filePath);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(item => collectScopedContentFiles(item, card, paths));
}

function collectExecSourcePaths(card) {
  const paths = new Set();
  collectExecSourceFiles(card?.rules, paths);
  return [...paths];
}

function collectFileContentPaths(card) {
  const paths = new Set();
  collectContentFilePaths(card, paths);
  collectScopedContentFiles(card?.rules, card, paths);
  collectExecSourceFiles(card?.rules, paths);
  return [...paths];
}

export { collectExecSourcePaths, collectFileContentPaths, extractExecIncludes, resolveExecIncludePath };
