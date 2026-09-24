import { loadRuntimeDefinition } from '../../shared/game-card/runtime/loadDefinition.js';
import { loadMainProgram } from './mainProgram.js';
import { createAgentTransport } from '../chat/agentTransport.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';
import { requirePlayerProtocol } from '../../shared/game-card/runtime/playerProtocol.js';

async function loadPlayerSession(card, platform, config, createSession) {
  if (!card) return null;
  requirePlayerProtocol(card);
  const readText = path => platform.resources.readText(card.id, path);
  const definition = await loadRuntimeDefinition({ readText });
  // Check modules before exposing input; never execute card code during loading.
  const program = await loadMainProgram(definition, readText);
  const session = createSession({ definition, readText, program, trace: runtimeTrace,
    generate: createAgentTransport(async model => {
      if (model !== 'default') throw new Error(`未知模型配置：${model}`);
      return config.load();
    }) });
  await session.beginLoad();
  return { card: definition.card, session };
}

export { loadPlayerSession };
