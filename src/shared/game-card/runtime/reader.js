import { readerTokens } from './readerTokens.js';
import { deepFreeze } from '../utils/jsonValue.js';

async function* units(source, mode, separator) {
  let text = '', patches = [];
  const take = () => { const value = { text, patches }; text = ''; patches = []; return value; };
  for await (const token of readerTokens(source)) {
    if (mode === 'continuous') {
      if (token.type === 'text') yield { text: token.text, patches: [] };
      continue;
    }
    if (token.type === 'state_patch') continue;
    if (token.type === 'state_patch_stream') {
      if (text.trim()) yield take();
      else text = '';
      patches.push(token.text);
      continue;
    }
    text += token.text;
    let match;
    while ((match = separator ? text.indexOf(separator) : text.search(/\n[ \t]*\n+/)) >= 0) {
      const length = separator?.length || text.slice(match).match(/^\n[ \t]*\n+/)[0].length;
      const rest = text.slice(match + length);
      text = text.slice(0, match);
      if (text.trim()) yield take();
      text = rest;
    }
  }
  if (text.trim() || patches.length) { if (!text.trim()) text = ''; yield take(); }
}

function createReader({ source, mode, separator, applyPatch, check = () => {}, onError = () => {} }) {
  if (typeof source !== 'string' && typeof source?.[Symbol.asyncIterator] !== 'function') {
    throw new Error('reader source must be a string or AsyncIterable<string>');
  }
  if (!['segmented', 'continuous'].includes(mode)) throw new Error('invalid reader mode');
  const iterator = units(source, mode, separator?.replace(/\r\n?/g, '\n'));
  let busy = false, finished = false, failure;
  const reader = Object.freeze({ async next() {
    try {
      check();
      if (failure) throw failure;
      if (busy) throw new Error('concurrent reader.next() is not allowed');
      if (finished) return { done: true, value: undefined };
    } catch (error) { onError(error); throw error; }
    busy = true;
    try {
      const result = await iterator.next();
      check();
      if (result.done) { finished = true; return { done: true, value: undefined }; }
      for (const text of result.value.patches) { check(); await applyPatch(text); }
      check();
      return deepFreeze(result);
    } catch (error) { failure = error; onError(error); throw error; }
    finally { busy = false; }
  } });
  return { reader, mode, get finished() { return finished; } };
}

export { createReader };
