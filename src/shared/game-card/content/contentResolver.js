import { parseSource, parseTransform } from './contentParser.js';
import { applyTransform, renderValue } from './contentTransforms.js';
import { resolveContentObject } from './contentObjects.js';
import { resolveFileSource } from './contentFiles.js';
import { getStateValue, hasStateValue } from '../state/statePaths.js';


function resolveSource(body, originalMessage, options) {
  if (body === 'original_content') return originalMessage.content || '';
  if (body.startsWith('state:')) return resolveState(body.slice('state:'.length), options, false);
  if (body.startsWith('state_json:')) return resolveState(body.slice('state_json:'.length), options, true);
  if (body.startsWith('file:')) return resolveFileSource(body.slice('file:'.length), options);
  throw new Error(`unsupported content source: ${body}`);
}

function resolveState(statePath, options, asJson) {
  const state = options.state || {};
  if (!hasStateValue(state, statePath)) return '';
  const value = getStateValue(state, statePath);
  if (value === undefined || value === null) return '';
  if (asJson) return JSON.stringify(value);
  if (Array.isArray(value)) return value;
  return typeof value === 'object' ? '' : String(value);
}


function skipSpaces(expression, index) {
  let cursor = index;
  while (/\s/.test(expression[cursor] || '')) cursor += 1;
  return cursor;
}

function parseChain(expression, index, originalMessage, options) {
  const source = parseSource(expression, skipSpaces(expression, index));
  let value = resolveSource(source.body, originalMessage, options);
  let cursor = source.next;
  let transform = parseTransform(expression, cursor);

  while (transform) {
    value = applyTransform(value, transform);
    cursor = transform.next;
    transform = parseTransform(expression, cursor);
  }
  return { value, next: cursor };
}

function resolveTemplate(content, originalMessage, options) {
  let cursor = 0;
  let resolved = '';
  while (cursor < content.length) {
    const start = content.indexOf('{{', cursor);
    if (start < 0) return resolved + content.slice(cursor);
    resolved += content.slice(cursor, start);
    const chain = parseChain(content, start, originalMessage, options);
    resolved += renderValue(chain.value);
    cursor = chain.next;
  }
  return resolved;
}

function resolveContent(content, originalMessage = {}, options = {}) {
  if (content && typeof content === 'object') {
    return resolveContentObject(content, originalMessage, options, resolveContent);
  }
  if (typeof content !== 'string') return '';
  if (!content.includes('{{')) return content;
  return resolveTemplate(content, originalMessage, options);
}

export { resolveContent };
