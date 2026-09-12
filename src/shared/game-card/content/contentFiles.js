import { extractUniqueFileSection } from './fileSections.js';
import { resolveRegisteredTextPath } from './fileScopes.js';
import { getStateValue, hasStateValue } from '../state/statePaths.js';
import { record } from '../trace/nodes.js';

function readDeclaredFile(filePath, options) {
  if (options.fileContents && Object.prototype.hasOwnProperty.call(options.fileContents, filePath)) {
    return options.fileContents[filePath];
  }
  if (typeof options.readFile !== 'function') throw new Error('file requires preloaded content');
  const content = options.readFile(filePath);
  if (typeof content !== 'string') throw new Error(`file reader must return text: ${filePath}`);
  return content;
}

function resolveRefValue(ref, options, label) {
  const value = ref.trim();
  if (!value.startsWith('$')) return value;
  const statePath = value.slice(1).replace(/^state\./, '');
  if (!hasStateValue(options.state || {}, statePath)) throw new Error(`${label} state not found: ${statePath}`);
  const resolved = getStateValue(options.state || {}, statePath);
  if (typeof resolved !== 'string' || resolved.length === 0) throw new Error(`${label} requires string state: ${statePath}`);
  return resolved;
}

function parseFileRef(ref) {
  const marker = ref.indexOf('#');
  if (marker < 0) return { fileRef: ref.trim(), sectionRef: '' };
  return { fileRef: ref.slice(0, marker).trim(), sectionRef: ref.slice(marker + 1).trim() };
}

function resolveFileSource(ref, options) {
  const { fileRef, sectionRef } = parseFileRef(ref);
  const fileId = resolveRefValue(fileRef, options, 'file');
  if (fileRef.trim().startsWith('$') && typeof options.card?.files?.[fileId] !== 'string') {
    throw new Error(`dynamic file reference requires an exact file id: ${fileId}`);
  }
  const filePath = resolveRegisteredTextPath(options.card, fileId);
  if (!filePath) throw new Error(`unknown content file id: ${fileId}`);
  const content = readDeclaredFile(filePath, options);
  record(options, 'resource.read', { file: filePath, reference: ref, status: 'completed', characters: content.length });
  if (!sectionRef) return content;
  const heading = resolveRefValue(sectionRef, options, 'file section');
  return extractUniqueFileSection(content, heading);
}

export { parseFileRef, resolveFileSource };
