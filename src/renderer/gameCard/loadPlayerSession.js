import { loadRuntimeDefinition } from '../../shared/game-card/runtime/loadDefinition.js';
import { loadMainProgram } from './mainProgram.js';
import { createAgentTransport } from '../chat/agentTransport.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';
import { requirePlayerProtocol } from '../../shared/game-card/runtime/playerProtocol.js';
import { readDefaultChatFile } from './defaultChatCard.js';
import { migrateChatHistory } from './migrateChatHistory.js';
import { sendPlainChatRequest } from '../chat/plainChatRequest.js';

async function loadPlayerSession(card, platform, config, createSession) {
  if (card) requirePlayerProtocol(card);
  const readText = card ? path => platform.resources.readText(card.id, path) : readDefaultChatFile;
  const definition = await loadRuntimeDefinition({ readText });
  // Check modules before exposing input; never execute card code during loading.
  const program = await loadMainProgram(definition, readText);
  const session = createSession({ definition, readText, program, trace: runtimeTrace,
    migrateHistory: card ? undefined : migrateChatHistory,
    generate: createAgentTransport(async model => {
      if (model !== 'default') throw new Error(`未知模型配置：${model}`);
      const value = await config.load();
      if (!card && (!value?.apiUrl || !value?.apiKey)) throw new Error('请先在右侧设置面板配置模型 API');
      return !card && !value.modelName ? { ...value,
        modelName: value.protocol === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-3.5-turbo' } : value;
    }, card ? undefined : sendPlainChatRequest) });
  await session.beginLoad();
  return { card: card ? definition.card : null, session };
}

export { loadPlayerSession };
