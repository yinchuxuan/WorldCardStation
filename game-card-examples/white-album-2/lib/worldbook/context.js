/* eslint-disable no-unused-vars */
/* global worldbookHistory, worldbookScanText */

function worldbookEnvironment(ctx, book) {
  const warnings = [];
  const seen = new Set();
  const scans = new Map();
  const args = ctx.args || {};
  const history = worldbookHistory(ctx.messages);
  const warn = (code, entry, detail = '') => {
    const warning = { code, entry_id: entry?.id, detail };
    const key = JSON.stringify(warning);
    if (seen.has(key)) return;
    seen.add(key);
    if (warnings.length < 100) warnings.push(warning);
  };
  const sources = [
    ['matchPersonaDescription', args.user?.description], ['matchCharacterDescription', args.character?.description],
    ['matchCharacterPersonality', args.character?.personality], ['matchCharacterDepthPrompt', args.character?.depth_prompt],
    ['matchScenario', args.character?.scenario], ['matchCreatorNotes', args.character?.creator_notes]
  ];
  return {
    ...ctx, args, book, history, warnings, warn,
    assistantCount: history.filter(message => message.role === 'assistant').length,
    scan(entry) {
      const depth = Number.isInteger(entry.scan_depth) ? entry.scan_depth : 4;
      if (!scans.has(depth)) scans.set(depth, worldbookScanText(history, depth));
      const extra = sources.filter(([flag]) => entry[flag]).map(([flag, value]) => {
        if (typeof value !== 'string') warn('missing_matching_source', entry, flag);
        return typeof value === 'string' ? value : '';
      });
      return [scans.get(depth), ...extra].join('\n');
    }
  };
}

function worldbookContextAllows(entry, env) {
  const trigger = env.args.generation_type ?? 'normal';
  if (Array.isArray(entry.triggers) && entry.triggers.length && !entry.triggers.includes(trigger)) return false;
  const filter = entry.characterFilter;
  if (!filter || (!filter.names?.length && !filter.tags?.length)) return true;
  if (!env.args.character) {
    env.warn('missing_character_filter_context', entry);
    return false;
  }
  const name = env.args.character.id ?? env.args.character.name;
  const checks = [];
  if (filter.names?.length) checks.push(filter.names.includes(name));
  if (filter.tags?.length) checks.push(!!filter.tags.some(tag => env.args.character.tags?.includes(tag)));
  return checks.every(matches => filter.isExclude ? !matches : matches);
}

function worldbookHash(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
