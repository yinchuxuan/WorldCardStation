function normalizeUiRootSource(source) {
  if (/\bimport\s*(?:[\w*{]|['"])/.test(source) || /\brequire\s*\(/.test(source)) {
    throw new Error('ui root source cannot use import or require');
  }
  if (/\b(process|window|document|fetch|ipcRenderer|localStorage|sessionStorage|globalThis|Function|eval)\b/.test(source)) {
    throw new Error('ui root source contains blocked browser runtime token');
  }
  const defaultNames = [];
  let code = source.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_, name) => {
    defaultNames.push(name);
    return `function ${name}(`;
  });
  code = code.replace(/export\s+default\s+function\s*\(/g, 'module.exports.default = function (');
  code = code.replace(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/g, 'module.exports.default = $1;');
  code = code.replace(/export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?/g, 'module.exports.default = $1;');
  code = code.replace(/export\s+(function|const|let|var)\s+/g, '$1 ');
  if (defaultNames.length) {
    code += `\nmodule.exports.default = module.exports.default || ${defaultNames[defaultNames.length - 1]};`;
  }
  return code;
}

function createUiRootFactory(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('ui root source is empty');
  const code = normalizeUiRootSource(source);
  return Function(
    'React',
    'module',
    'exports',
    'require',
    'process',
    'window',
    'document',
    'fetch',
    'ipcRenderer',
    'localStorage',
    'sessionStorage',
    'globalThis',
    `
      'use strict';
      ${code}
      return {
        moduleExport: module.exports,
        exportsValue: exports,
        namedRoot: typeof Root === 'undefined' ? undefined : Root
      };
    `
  );
}

export { createUiRootFactory };
