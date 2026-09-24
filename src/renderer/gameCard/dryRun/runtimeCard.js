import { loadRuntimeDefinition } from '../../../shared/game-card/runtime/loadDefinition.js';
import { loadMainModules } from '../../../shared/game-card/runtime/mainModules.js';

async function checkRuntimeCard(readText, checkContent) {
  let definition;
  try { definition = await loadRuntimeDefinition({ readText }); }
  catch (error) { return { diagnostics: [{ code: 'runtime_schema', file: error.file || 'card.json', pointer: '', message: error.message }], warnings: [], checked: ['runtime_schema'] }; }
  const diagnostics = [], warnings = [], checked = new Set(['runtime_schema']);
  const append = (result, sources, file) => {
    for (const key of ['diagnostics', 'warnings']) {
      for (const entry of result[key]) {
        const location = entry.file ? {} : sources[entry.pointer] || { file, pointer: entry.pointer };
        (key === 'diagnostics' ? diagnostics : warnings).push({ ...entry, ...location });
      }
    }
    result.checked.forEach(item => checked.add(item));
  };
  append(await checkContent({ ...definition.card, rules: [] }, readText, true), definition.sources, 'card.json');
  for (const agent of Object.values(definition.agents)) {
    const card = { ...definition.card, ...agent.definition, display: undefined, ui: undefined };
    append(await checkContent(card, readText, true), agent.sources, agent.file);
  }
  try {
    await loadMainModules({ main: definition.main, readText });
    checked.add('main_modules');
  } catch (error) {
    diagnostics.push({ code: 'main_syntax', file: definition.main.path, pointer: '', message: error.message });
  }
  return { diagnostics, warnings, checked: [...checked] };
}

export { checkRuntimeCard };
