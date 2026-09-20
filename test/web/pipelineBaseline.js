import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { controlledScriptExecutor } from '../../src/renderer/platform/controlledScriptExecutor.js';
import { pipelineScenario } from './pipelineScenario.js';

export async function baseline() {
  const source = path.resolve('dist/web-fixture/cards');
  const index = JSON.parse(await readFile(path.join(source, 'index.json'), 'utf8'));
  const root = path.dirname(path.join(source, index.cards[0].release));
  const card = JSON.parse(await readFile(path.join(root, 'card.json'), 'utf8'));
  return pipelineScenario({ repository: { getActiveCard: async () => card },
    resources: { readText: async (_id, file) => readFile(path.join(root, file), 'utf8') },
    scriptExecutor: controlledScriptExecutor });
}
