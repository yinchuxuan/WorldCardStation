/* eslint-disable no-unused-vars */

function worldbookStringList(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  return typeof value === 'string' && value ? [value] : [];
}

function worldbookValue(source, ...names) {
  for (const name of names) {
    if (source?.[name] !== undefined && source[name] !== null) return source[name];
  }
  return undefined;
}

const WORLDBOOK_ALIASES = {
  case_sensitive: ['case_sensitive', 'caseSensitive'], scan_depth: ['scan_depth', 'scanDepth'],
  matchWholeWords: ['match_whole_words', 'matchWholeWords'], selectiveLogic: ['selectiveLogic', 'selective_logic'],
  probability: ['probability'], useProbability: ['useProbability', 'use_probability'],
  excludeRecursion: ['exclude_recursion', 'excludeRecursion'], preventRecursion: ['prevent_recursion', 'preventRecursion'],
  delayUntilRecursion: ['delay_until_recursion', 'delayUntilRecursion'], ignoreBudget: ['ignore_budget', 'ignoreBudget'],
  group: ['group'], groupOverride: ['group_override', 'groupOverride'],
  groupWeight: ['group_weight', 'groupWeight'], useGroupScoring: ['use_group_scoring', 'useGroupScoring'],
  sticky: ['sticky'], cooldown: ['cooldown'], delay: ['delay'], depth: ['depth'], role: ['role'],
  outletName: ['outlet_name', 'outletName'], matchPersonaDescription: ['match_persona_description', 'matchPersonaDescription'],
  matchCharacterDescription: ['match_character_description', 'matchCharacterDescription'],
  matchCharacterPersonality: ['match_character_personality', 'matchCharacterPersonality'],
  matchCharacterDepthPrompt: ['match_character_depth_prompt', 'matchCharacterDepthPrompt'],
  matchScenario: ['match_scenario', 'matchScenario'], matchCreatorNotes: ['match_creator_notes', 'matchCreatorNotes'],
  triggers: ['triggers'], characterFilter: ['characterFilter', 'character_filter'],
  vectorized: ['vectorized'], automationId: ['automation_id', 'automationId']
};

function worldbookEntryFormat(entry, settings, native, fallback) {
  if (settings.format && settings.format !== 'auto') return settings.format;
  const extension = entry.extensions || {};
  const exported = Number.isInteger(extension.position)
    || ['useProbability', 'selectiveLogic', 'group_weight', 'exclude_recursion'].some(key => key in extension);
  return native || exported || 'key' in entry || 'uid' in entry ? 'sillytavern' : fallback;
}

function worldbookNormalizeEntry(entry, sourceId, index, book, native) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`invalid worldbook entry: ${sourceId ?? index}`);
  }
  const extension = entry.extensions || {};
  const format = worldbookEntryFormat(entry, book.settings, native, book.format);
  const normalized = {
    ...entry,
    id: String(entry.id ?? entry.uid ?? sourceId ?? `entry-${index}`),
    name: entry.name ?? entry.comment,
    keys: worldbookStringList(entry.keys ?? entry.key),
    secondary_keys: worldbookStringList(entry.secondary_keys ?? entry.keysecondary),
    enabled: entry.enabled !== false && entry.enabled !== 0 && !entry.disable,
    constant: !!entry.constant,
    insertion_order: entry.insertion_order ?? entry.order ?? entry.displayIndex ?? index,
    position: extension.position ?? entry.position,
    _format: format
  };
  for (const [key, names] of Object.entries(WORLDBOOK_ALIASES)) {
    // ST exports overrides under extensions; null means inherit the book setting.
    normalized[key] = worldbookValue(extension, ...names) ?? worldbookValue(entry, ...names);
  }
  normalized.case_sensitive ??= book.case_sensitive;
  normalized.matchWholeWords ??= book.matchWholeWords;
  normalized.useGroupScoring ??= book.useGroupScoring;
  normalized.scan_depth ??= book.scan_depth;
  normalized.groupWeight ??= 100;
  normalized.depth ??= 4;
  if (format === 'v3' && normalized.use_regex) normalized.constant = false;
  return normalized;
}

function worldbookNormalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('worldbook config must be an object');
  }
  const source = input.spec === 'lorebook_v3' ? input.data : input;
  if (!source || typeof source !== 'object') throw new Error('worldbook data must be an object');
  const settings = source.extensions?.world_card_station || {};
  if (settings.format && !['auto', 'v2', 'v3', 'sillytavern'].includes(settings.format)) {
    throw new Error(`unknown worldbook format: ${settings.format}`);
  }
  const book = {
    ...source, settings,
    format: settings.format && settings.format !== 'auto' ? settings.format
      : input.spec === 'lorebook_v3' ? 'v3' : 'v2',
    scan_depth: source.scan_depth ?? source.scanDepth ?? 4,
    token_budget: source.token_budget ?? source.tokenBudget,
    recursive_scanning: source.recursive_scanning ?? source.recursiveScanning ?? false,
    case_sensitive: worldbookValue(settings, 'case_sensitive', 'caseSensitive')
      ?? worldbookValue(source, 'case_sensitive', 'caseSensitive') ?? false,
    matchWholeWords: worldbookValue(settings, 'match_whole_words', 'matchWholeWords')
      ?? worldbookValue(source, 'match_whole_words', 'matchWholeWords') ?? false,
    useGroupScoring: worldbookValue(settings, 'use_group_scoring', 'useGroupScoring')
      ?? worldbookValue(source, 'use_group_scoring', 'useGroupScoring') ?? false,
    max_recursion_steps: settings.max_recursion_steps ?? source.max_recursion_steps ?? 8,
    prefix: settings.prefix ?? source.prefix,
    suffix: settings.suffix ?? source.suffix,
    join: settings.join ?? source.join
  };
  const native = !Array.isArray(source.entries);
  if (!source.entries || typeof source.entries !== 'object') throw new Error('worldbook config requires entries');
  book.entries = Object.entries(source.entries).map(([id, entry], index) => (
    worldbookNormalizeEntry(entry, native ? id : null, index, book, native)
  ));
  const ids = new Set();
  for (const entry of book.entries) {
    if (!entry.id || ids.has(entry.id)) throw new Error(`duplicate or empty worldbook entry id: ${entry.id}`);
    ids.add(entry.id);
  }
  return book;
}
