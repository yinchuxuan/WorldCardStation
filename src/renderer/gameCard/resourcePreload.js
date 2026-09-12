import { extractExecIncludes, resolveExecIncludePath } from './execSource.js';
import { resolveRegisteredTextPath } from '../../shared/game-card/content/fileScopes.js';
import { parseSource, parseTransform } from '../../shared/game-card/content/contentParser.js';

function collectContentFilePaths(card, paths) {
  Object.values(card?.files || {}).forEach((filePath) => {
    if (typeof filePath === 'string') paths.add(filePath);
  });
}

function collectScopedContentFiles(value, card, paths) {
  if (typeof value === 'string') {
    let cursor = 0;
    while ((cursor = value.indexOf('{{', cursor)) >= 0) {
      const source = parseSource(value, cursor);
      if (source.body.startsWith('file:')) {
        const fileRef = source.body.slice(5).split('#', 1)[0].trim();
        const filePath = fileRef.startsWith('$') ? null : resolveRegisteredTextPath(card, fileRef);
        if (filePath) paths.add(filePath);
      }
      cursor = source.next;
      let transform;
      while ((transform = parseTransform(value, cursor))) cursor = transform.next;
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  ['prefix', 'suffix', 'default'].forEach(key => collectScopedContentFiles(value[key], card, paths));
  for (const branch of value.include || value.select || []) {
    collectScopedContentFiles(branch.content, card, paths);
  }
}

function collectActions(actions, card, paths, withContent) {
  for (const action of actions || []) {
    if (action.type === undefined && Array.isArray(action.then)) {
      collectActions(action.then, card, paths, withContent);
    } else if (action.type === 'exec' && typeof action.sourceFile === 'string') {
      paths.add(action.sourceFile);
    } else if (withContent && ['insert', 'replace'].includes(action.type)) {
      collectScopedContentFiles(action.content, card, paths);
    }
  }
}

function collectExecSourcePaths(card) {
  const paths = new Set();
  for (const rule of card?.rules || []) collectActions(rule.then, card, paths, false);
  return [...paths];
}

function collectFileContentPaths(card) {
  const paths = new Set();
  collectContentFilePaths(card, paths);
  for (const rule of card?.rules || []) collectActions(rule.then, card, paths, true);
  return [...paths];
}

export { collectExecSourcePaths, collectFileContentPaths, extractExecIncludes, resolveExecIncludePath };
