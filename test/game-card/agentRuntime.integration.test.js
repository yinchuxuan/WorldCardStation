import fs from 'node:fs';
import path from 'node:path';
import { loadRuntimeDefinition } from '../../src/shared/game-card/runtime/loadDefinition.js';
import { createAgentRuntime } from '../../src/shared/game-card/runtime/agentRuntime.js';
import { runExecAction } from '../../src/renderer/gameCard/execRunner.js';

test('loaded Judge/Narrator fixture runs without UI, using shared files and real exec', async () => {
  expect(typeof window).toBe('undefined');
  const root = fs.realpathSync(path.resolve(__dirname, '../fixtures/runtime-definition'));
  function readFile(file) {
    const resolved = fs.realpathSync(path.resolve(root, file));
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('outside card root');
    const text = fs.readFileSync(resolved, 'utf8');
    if (file !== 'agents/judge.json') return text;
    const agent = JSON.parse(text);
    agent.rules.push({ when: { phase: 'post_response' }, then: [{ type: 'exec', source:
      'state.turn.judgment = "accepted"; return { messages, state };' }] });
    return JSON.stringify(agent);
  }
  const definition = await loadRuntimeDefinition({ readText: readFile,
    stat: file => fs.statSync(path.resolve(root, file)).isFile() ? 'file' : 'directory',
    modelIds: ['narration-model'] });
  const references = [];
  const requests = [];
  const generate = async (request, callbacks) => {
    references.push(request.model);
    requests.push(request);
    callbacks.onToken(request.model === 'default' ? 'judge raw' : 'narrator raw');
  };
  const app = createAgentRuntime({ definition, generate, dependencies: { readFile, runExecAction } });
  app.state.set('turn.input', 'start');
  await app.agents.call('judge').done();
  expect(app.state.get('turn.judgment')).toBe('accepted');
  await app.agents.call('narrator').done();
  expect(references).toEqual(['default', 'narration-model']);
  expect(requests[0].messages[0].content).toBe(fs.readFileSync(path.join(root, 'intro.md'), 'utf8'));
  expect(requests[0].messages[1]).toMatchObject({ role: 'user', content: 'start' });
  expect(requests[1].messages).toMatchObject([{ role: 'system', content: 'judge raw' }]);
  expect(app.state.get('turn.narrated')).toBe(true);
});
