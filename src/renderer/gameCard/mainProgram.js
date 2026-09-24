import { loadMainModules } from '../../shared/game-card/runtime/mainModules.js';
import { collectFileContentPaths, collectExecSourcePaths } from './resourcePreload.js';
import { collectExecDependencies } from './execDependencies.js';

async function loadMainProgram(definition, readText) {
  const graph = await loadMainModules({ main: definition.main, readText });
  const fileContents = {};
  const scripts = new Set();
  async function preload(path) {
    const source = Object.hasOwn(fileContents, path) ? fileContents[path] : await readText(path);
    if (typeof source !== 'string') throw new Error(`${path}: expected text`);
    fileContents[path] = source;
    return source;
  }
  for (const agent of Object.values(definition.agents)) {
    const card = { ...definition.card, rules: agent.definition.rules };
    for (const path of collectFileContentPaths(card)) await preload(path);
    for (const path of collectExecSourcePaths(card)) scripts.add(path);
  }
  await collectExecDependencies(scripts, preload, new Map(),
    (_, path) => new Error(`${path}: circular/deep exec include`));
  return { definition, graph, fileContents };
}

export { loadMainProgram };
