import { resolveFileSource } from './contentFiles.js';
import { resolveScopedTextPath } from '../../shared/game-card/content/fileScopes.js';

const fileEntriesByApi = new WeakMap();

function createExecFiles(options = {}, state = {}) {
  const api = Object.freeze({
    read: (fileRef) => {
      if (typeof fileRef !== 'string' || fileRef.length === 0) {
        throw new Error('files.read requires a file id');
      }
      return resolveFileSource(fileRef, { ...options, state });
    },
    readText: async (scopeId, relativePath) => {
      const filePath = resolveScopedTextPath(options.card, scopeId, relativePath);
      let content;
      if (options.fileContents && Object.prototype.hasOwnProperty.call(options.fileContents, filePath)) {
        content = options.fileContents[filePath];
      } else {
        const reader = options.readText || options.readFile;
        if (typeof reader !== 'function') throw new Error('scoped text requires a platform reader');
        content = await reader(filePath);
      }
      if (typeof content !== 'string') throw new Error(`scoped file reader must return text: ${filePath}`);
      return content;
    }
  });
  fileEntriesByApi.set(api, () => Object.fromEntries(Object.entries(options.card?.files || {})
    .filter(([, filePath]) => typeof filePath === 'string')
    .map(([fileId]) => [fileId, resolveFileSource(fileId, { ...options, state })])));
  return api;
}

function getExecFileEntries(api) {
  return fileEntriesByApi.get(api)?.() || {};
}

export { createExecFiles, getExecFileEntries };
