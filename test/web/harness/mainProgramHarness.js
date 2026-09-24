import { createBrowserMainSession } from '../../../src/renderer/platform/mainWorkerFactory.mjs';

window.mainProgramHarness = async () => {
  const definition = {
    card: { id: 'main-test' }, stateSchema: { count: { type: 'number', default: 0 } },
    main: { path: 'main.js', source: `import {next} from './logic.js';
      export async function onInput(ctx) {
        ctx.state.set('globals', [typeof fetch, typeof self, typeof indexedDB, typeof globalThis,
          typeof (() => {}).constructor, typeof (async () => {}).constructor]);
        await ctx.agents.call('judge').done();
        ctx.state.set('count', next(ctx.state.get('count')));
        await ctx.agents.call('narrator').done();
      }` },
    agents: Object.fromEntries(['judge', 'narrator'].map(id => [id, { definition: { model: 'default', rules: [] } }]))
  };
  const seen = [];
  const session = createBrowserMainSession({ definition,
    readText: async () => 'export const next = n => n + 1;',
    generate: async ({ agentId }, cb) => { seen.push(agentId); cb.onToken('ok'); }
  });
  try {
    const result = await session.send('go');
    const infinite = createBrowserMainSession({ definition: { ...definition,
      main: { path: 'main.js', source: 'export async function onInput() { while(true) {} }' } }, timeoutMs: 100 });
    let timeout;
    try { await infinite.send('go'); } catch (error) { timeout = error.message; }
    finally { await infinite.dispose(); }
    return { result, seen, timeout };
  } catch (error) { return { errorMessage: error.message }; }
  finally { await session.dispose(); }
};

const runButton = document.createElement('button');
runButton.textContent = 'Run main.js smoke test';
const output = document.createElement('pre');
runButton.onclick = async () => {
  runButton.disabled = true;
  output.textContent = 'Running';
  output.textContent = JSON.stringify(await window.mainProgramHarness(), null, 2);
  runButton.disabled = false;
};
document.body.append(runButton, output);
