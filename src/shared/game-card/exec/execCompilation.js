// This function is also embedded verbatim in the production Worker. Keep it self-contained.
function compileExecSource(source, isSourceFile) {
  const body = isSourceFile
    ? source + '\nif (typeof run !== "function") throw new Error("exec sourceFile must define function run(ctx)");\nreturn run(__ctx);'
    : '"use strict";\nconst ctx = __ctx;\nconst { messages, state, config, event, args, utils, files } = ctx;\n' + source;
  return Function('__ctx', 'self', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket',
    'EventSource', 'BroadcastChannel', 'Worker', 'SharedWorker', 'navigator', 'location', 'caches',
    'importScripts', 'postMessage', 'close', 'indexedDB', body);
}

function assertBrowserExecSource(source) {
  if (/\b(Function|eval)\b/.test(source)) throw new Error('exec source contains blocked browser runtime token');
}

export { compileExecSource, assertBrowserExecSource };
