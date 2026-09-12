import { compileExecSource } from '../../shared/game-card/exec/execCompilation.js';

const scriptWorkerSource = String.raw`
const compileExecSource = ${compileExecSource.toString()};
function section(content, heading) {
  const lines = String(content).split(/\r?\n/);
  const escaped = String(heading).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const headingPattern = new RegExp('^(#{1,6})\\s+' + escaped + '\\s*$');
  const start = lines.findIndex(line => headingPattern.test(line));
  if (start < 0) throw new Error('file section not found: ' + heading);
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) { end = index; break; }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}
let nextFileRequestId = 1;
const pendingFileReads = new Map();
function readScopedText(scopeId, relativePath) {
  return new Promise((resolve, reject) => {
    const requestId = nextFileRequestId++;
    pendingFileReads.set(requestId, { resolve, reject });
    self.postMessage({ type: 'file.read', requestId, scopeId, relativePath });
  });
}
function settleFileRead(data) {
  const pending = pendingFileReads.get(data.requestId);
  if (!pending) return;
  pendingFileReads.delete(data.requestId);
  if (data.error) pending.reject(new Error(data.error));
  else pending.resolve(data.content);
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function createFiles(entries, state, traceEnabled) {
  return Object.freeze({ read(ref) {
    try {
    const marker = String(ref).indexOf('#');
    const rawFile = marker < 0 ? String(ref) : String(ref).slice(0, marker);
    const rawSection = marker < 0 ? '' : String(ref).slice(marker + 1);
    const resolve = value => value.trim().startsWith('$')
      ? value.trim().slice(1).replace(/^state\./, '').split('.').reduce((item, key) => item?.[key], state)
      : value.trim();
    const fileId = resolve(rawFile);
    if (!Object.prototype.hasOwnProperty.call(entries, fileId)) throw new Error('unknown content file id: ' + fileId);
    const content = rawSection ? section(entries[fileId], resolve(rawSection)) : entries[fileId];
    if (traceEnabled) self.postMessage({ type: 'trace.file', detail: { reference: ref, fileId, status: 'completed', characters: content.length } });
    return content;
    } catch (error) {
      if (traceEnabled) self.postMessage({ type: 'trace.file', detail: { reference: ref, status: 'failed', error: error.message } });
      throw error;
    }
  }, readText: readScopedText });
}
function createUtils() {
  return Object.freeze({
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    roll: dice => {
      const match = String(dice).match(/^(\d*)d(\d+)$/i);
      if (!match) throw new Error('invalid dice expression');
      const count = Number(match[1] || 1), sides = Number(match[2]);
      return Array.from({ length: count }).reduce(sum => sum + Math.floor(Math.random() * sides) + 1, 0);
    },
    uuid: () => crypto.randomUUID()
  });
}
self.onmessage = async event => {
  if (event.data.type === 'file.response') {
    settleFileRead(event.data);
    return;
  }
  try {
    const data = event.data;
    const context = {
      ...data.context,
      config: deepFreeze(data.context.config || {}),
      event: deepFreeze(data.context.event || {}),
      args: deepFreeze(data.context.args || {}),
      files: createFiles(data.files, data.context.state, data.traceEnabled),
      utils: createUtils()
    };
    const execute = compileExecSource(data.source, data.isSourceFile);
    const result = await execute(context, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message || String(error), stack: error.stack });
  }
};`;

export { scriptWorkerSource };
