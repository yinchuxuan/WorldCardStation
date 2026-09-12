import { resolveFileSource } from '../../shared/game-card/content/contentFiles.js';
import { resolveScopedTextPath } from '../../shared/game-card/content/fileScopes.js';
import { record } from '../../shared/game-card/trace/nodes.js';

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
      const details = { scopeId, relativePath };
      record(options, 'resource.read.start', details);
      try {
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
        record(options, 'resource.read', { ...details, file: filePath, status: 'completed', characters: content.length });
        return content;
      } catch (error) {
        record(options, 'resource.read', { ...details, status: 'failed', error: error.message });
        throw error;
      }
    }
  });
  fileEntriesByApi.set(api, () => Object.fromEntries(Object.entries(options.card?.files || {})
    .filter(([, filePath]) => typeof filePath === 'string')
    .map(([fileId]) => [fileId, resolveFileSource(fileId, { ...options, state, observer: undefined })])));
  return api;
}

function getExecFileEntries(api) {
  return fileEntriesByApi.get(api)?.() || {};
}

export { createExecFiles, getExecFileEntries };
