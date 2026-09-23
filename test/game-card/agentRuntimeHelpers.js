import { createAgentRuntime } from '../../src/shared/game-card/runtime/agentRuntime.js';

const rule = (phase, then, extra = {}) => ({ when: { phase }, then, ...extra });
const insert = (content, extra = {}) => ({ type: 'insert', role: 'system', content, ...extra });
function runtime(agents, generate = async (_, callbacks) => callbacks.onToken('answer'), options = {}) {
  return createAgentRuntime({
    definition: { card: {}, stateSchema: { count: { type: 'number', default: 0 } },
      agents: Object.fromEntries(Object.entries(agents).map(([id, value]) => [id, {
        definition: { model: 'default', rules: [], ...value }
      }])), ...options.definition },
    generate, dependencies: options.dependencies
  });
}
function barrier() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function consume(source) {
  let result = '';
  for await (const text of source) result += text;
  return result;
}
export { runtime, rule, insert, barrier, consume };
