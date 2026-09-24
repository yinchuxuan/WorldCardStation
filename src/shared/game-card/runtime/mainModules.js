import { parse } from 'acorn';

function resolveModule(parent, reference) {
  if (typeof reference !== 'string' || !/^\.\.?\//.test(reference)
    || /[\\:?#%]/.test(reference) || [...reference].some(char => char.charCodeAt(0) < 32)) {
    throw new Error(`invalid module reference: ${reference}`);
  }
  const parts = parent.split('/').slice(0, -1);
  for (const part of reference.split('/')) {
    if (part === '.') continue;
    if (!part) throw new Error('empty module path component');
    if (part === '..') {
      if (!parts.length) throw new Error('module escapes card directory');
      parts.pop();
    } else parts.push(part);
  }
  const path = parts.join('/');
  if (!path.endsWith('.js')) throw new Error('module must be a .js file');
  return path;
}

function inspect(node) {
  if (!node || typeof node !== 'object') return;
  if (['ImportExpression', 'MetaProperty'].includes(node.type)) throw new Error('dynamic import/import.meta are not available');
  if (node.type === 'Identifier' && (/^__wcs/.test(node.name) || ['eval', 'Function'].includes(node.name))) {
    throw new Error(`blocked script identifier: ${node.name}`);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === 'object') inspect(value);
  }
}

function compileModule(source, path) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  inspect(ast);
  const imports = [], exports = [], edits = [];
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const dependency = resolveModule(path, node.source.value);
      imports.push({ path: dependency, names: node.specifiers.map(s => s.type === 'ImportNamespaceSpecifier' ? '*' : (s.imported?.name || 'default')) });
      const expression = `__wcsImports[${JSON.stringify(dependency)}]`;
      edits.push({ start: node.start, end: node.end, text: node.specifiers.map(s =>
        `const ${s.local.name} = ${expression}${s.type === 'ImportNamespaceSpecifier' ? '' : `[${JSON.stringify(s.imported?.name || 'default')}]`};`).join('\n') });
    } else if (node.type === 'ExportNamedDeclaration' && !node.source && node.declaration) {
      const declaration = node.declaration;
      const names = declaration.type === 'VariableDeclaration'
        ? declaration.declarations.map(d => d.id.name) : [declaration.id?.name];
      if (names.some(name => !name) || (declaration.type === 'VariableDeclaration' && declaration.kind !== 'const')) {
        throw new Error('exports require named function/class or simple const declarations');
      }
      exports.push(...names);
      edits.push({ start: node.start, end: declaration.start, text: '' });
    } else if (node.type.startsWith('Export')) throw new Error('use named declaration exports; re-exports/default exports are not supported');
  }
  let body = source;
  for (const edit of edits.reverse()) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
  return { path, imports, exports, source: `"use strict";\n${body}\nreturn Object.freeze({${exports.join(',')}});` };
}

async function loadMainModules({ main, readText }) {
  const modules = {}, loading = new Set();
  async function visit(path, source) {
    if (loading.has(path)) throw new Error(`${path}: circular module import`);
    if (Object.hasOwn(modules, path)) return;
    if (loading.size >= 32 || Object.keys(modules).length >= 128) throw new Error('module graph limit exceeded');
    loading.add(path);
    try {
      const module = compileModule(source ?? await readText(path), path);
      for (const dependency of module.imports) {
        await visit(dependency.path);
        for (const name of dependency.names) {
          if (name !== '*' && !modules[dependency.path].exports.includes(name)) {
            throw new Error(`${dependency.path}: missing export ${name}`);
          }
        }
      }
      modules[path] = module;
    } catch (error) { throw new Error(`${path}: ${error.message}`, { cause: error }); }
    finally { loading.delete(path); }
  }
  await visit(main.path, main.source);
  if (!modules[main.path].exports.includes('onInput')) throw new Error(`${main.path}: missing onInput export`);
  return { entry: main.path, modules: Object.values(modules) };
}

export { loadMainModules, compileModule, resolveModule, inspect as inspectScriptAst };
