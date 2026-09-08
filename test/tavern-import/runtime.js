import { convertTavernCard } from '../../src/shared/tavern-import/convert.js';
import { createMemoryGameCardPlatform } from '../../src/renderer/platform/memoryGameCardPlatform.js';
import { controlledScriptExecutor } from '../../src/renderer/platform/controlledScriptExecutor.js';
import { scripts } from '../game-card/worldbookTestRuntime.js';

export function source(data = {}, spec = 'chara_card_v2') {
  return { spec, spec_version: spec.endsWith('v3') ? '3.0' : '2.0', data: {
    name: 'Alice', description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
    creator_notes: '', system_prompt: '', post_history_instructions: '', alternate_greetings: [],
    tags: [], creator: '', character_version: '', extensions: {}, ...data
  } };
}

export function runtime(input, options = {}) {
  const result = convertTavernCard({ source: input, id: 'tavern-test', ...options });
  const files = { ...scripts, ...result.files };
  const resolve = value => {
    if (value?.$import) return resolve(JSON.parse(files[value.$import]));
    if (Array.isArray(value)) return value.map(resolve).flat();
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)]));
    return value;
  };
  const card = resolve(JSON.parse(files['card.json']));
  const platform = createMemoryGameCardPlatform({ activeCard: card, files: { [card.id]: files },
    scriptExecutor: controlledScriptExecutor });
  return { ...result, card, platform, files };
}
