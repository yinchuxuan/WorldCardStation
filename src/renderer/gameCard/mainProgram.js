import { loadMainModules } from '../../shared/game-card/runtime/mainModules.js';
import { collectFileContentPaths, collectExecSourcePaths } from './resourcePreload.js';
import { extractExecIncludes, resolveExecIncludePath } from './execSource.js';

async function loadMainProgram(definition, readText) {
  const graph = await loadMainModules({ main: definition.main, readText });
  const fileContents = {};
  const scripts = new Set();
  async function preload(path, stack = [], script = false) {
    if (stack.includes(path) || stack.length > 20) throw new Error(`${path}: circular/deep exec include`);
    const source = Object.hasOwn(fileContents, path) ? fileContents[path] : await readText(path);
    if (typeof source !== 'string') throw new Error(`${path}: expected text`);
    fileContents[path] = source;
    if (!script || scripts.has(path)) return;
    for (const ref of extractExecIncludes(source)) {
      await preload(resolveExecIncludePath(path, ref), [...stack, path], true);
    }
    scripts.add(path);
  }
  for (const agent of Object.values(definition.agents)) {
    const card = { ...definition.card, rules: agent.definition.rules };
    for (const path of collectFileContentPaths(card)) await preload(path);
    for (const path of collectExecSourcePaths(card)) await preload(path, [], true);
  }
  return { definition, graph, fileContents };
}

export { loadMainProgram };
