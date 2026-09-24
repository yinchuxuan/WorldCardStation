import { extractExecIncludes, resolveExecIncludePath } from './execSource.js';

const MAX_INCLUDE_DEPTH = 20;
const defaultError = (kind, path) => new Error(kind === 'cycle'
  ? `circular exec include: ${path}` : 'exec include depth exceeded');

// Shared include traversal; callers retain ownership of their text/cache lifetime.
async function collectExecDependencies(roots, readText, includes = new Map(), error = defaultError) {
  const paths = new Set();
  async function visit(path, stack = []) {
    if (stack.includes(path)) throw error('cycle', path);
    if (stack.length > MAX_INCLUDE_DEPTH) throw error('depth', path);
    paths.add(path);
    if (!includes.has(path)) {
      includes.set(path, Promise.resolve().then(() => readText(path)).then(source => (
        extractExecIncludes(source).map(ref => resolveExecIncludePath(path, ref))
      )));
    }
    for (const child of await includes.get(path)) await visit(child, [...stack, path]);
  }
  for (const path of roots) await visit(path);
  return paths;
}

export { collectExecDependencies };
