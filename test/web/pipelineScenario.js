import { loadRuntimeDefinition } from '../../src/shared/game-card/runtime/loadDefinition.js';
import { createAgentRuntime } from '../../src/shared/game-card/runtime/agentRuntime.js';
import { loadMainProgram } from '../../src/renderer/gameCard/mainProgram.js';
import { runExecAction } from '../../src/renderer/gameCard/execRunner.js';

// Both Node and browser use the actual imported Agent definition and state/exec stack.
export async function pipelineScenario(platform) {
  const card = await platform.repository.getActiveCard();
  const readText = file => platform.resources.readText(card.id, file);
  const definition = await loadRuntimeDefinition({ readText });
  const program = await loadMainProgram(definition, readText);
  const runtime = createAgentRuntime({ definition,
    generate: async (_request, handlers) => handlers.onToken('你好。<state_patch>{"score":7}</state_patch>'),
    dependencies: { readText, fileContents: program.fileContents,
      runExecAction: (messages, state, action, options) =>
        runExecAction(messages, state, action, { ...options, scriptExecutor: platform.scriptExecutor }) }
  });
  const snapshots = [];
  try {
    await runtime.initialize();
    for (const input of ['第一轮', '第二轮']) {
      runtime.state.set('input', input);
      await runtime.agents.call('narrator').done();
      snapshots.push(runtime.snapshot());
    }
    return snapshots;
  } finally { runtime.stop(); }
}
