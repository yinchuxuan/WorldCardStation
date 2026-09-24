import { parse } from 'acorn';
import { inspectScriptAst } from '../../shared/game-card/runtime/mainModules.js';
import { executeMainRound } from '../../shared/game-card/runtime/mainRound.js';
import { runExecAction } from '../gameCard/execRunner.js';
import { lockMainWorker } from './mainWorkerSandbox.js';

// The compiler is captured before lockdown, never passed to a card function.
const compile = Function;
function createRuleExecutor() {
  const cache = new Map();
  return { run(source, ctx, { isSourceFile }) {
    const body = isSourceFile ? `${source}\nreturn run(__wcsCtx);`
      : `const ctx = __wcsCtx; const {messages,state,config,event,args,utils,files} = ctx;\n${source}`;
    const key = `${isSourceFile}:${source}`;
    if (!cache.has(key)) {
      inspectScriptAst(parse(`function run(ctx) { ${source} }`, { ecmaVersion: 'latest' }));
      cache.set(key, compile('__wcsCtx', `"use strict";\n${body}`));
    }
    return cache.get(key)(ctx);
  } };
}

function prepareMainExecution(global, program, bridge) {
  const { definition, graph, fileContents } = program;
  const factories = graph.modules.map(module => {
    try { return { ...module, evaluate: compile('__wcsImports', module.source) }; }
    catch (error) { throw new Error(`${module.path}: ${error.message}`); }
  });
  const scriptExecutor = createRuleExecutor();
  lockMainWorker(global);
  const modules = Object.create(null);
  for (const module of factories) {
    const evaluate = module.evaluate;
    try { modules[module.path] = evaluate(Object.freeze({ ...modules })); }
    catch (error) { throw new Error(`${module.path}: ${error.message}`, { cause: error }); }
  }
  const { onInput, onStart } = modules[graph.entry];
  if (typeof onInput !== 'function') throw new Error(`${graph.entry}: onInput must be a function`);
  if (onStart !== undefined && typeof onStart !== 'function') throw new Error(`${graph.entry}: onStart must be a function`);
  return data => executeMainRound({
    definition, onInput, onStart, ...data, generate: bridge.generate, display: bridge.display, onUpdate: bridge.onUpdate,
    dependencies: {
      observer: bridge.observer,
      fileContents, readText: bridge.readText,
      runExecAction: (messages, state, action, options) => runExecAction(messages, state, action, { ...options, scriptExecutor })
    }
  });
}

export { prepareMainExecution };
