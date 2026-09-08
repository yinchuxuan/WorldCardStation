/* eslint-disable no-unused-vars */
/* global worldbookContextAllows, worldbookDecoratorDecision, worldbookEntryMatches, worldbookMatchScore */
/* global worldbookSelectGroups, worldbookApplyBudget, worldbookBudgetUsed, worldbookSortEntries, worldbookPositionAvailable */

function worldbookProbability(item, env, cache) {
  if (item.sticky || (item.forced && item.entry._format === 'v3')) return true;
  const { entry } = item;
  if (cache.has(entry.id)) return cache.get(entry.id);
  const probability = entry.probability;
  const matches = entry.useProbability === false || entry.useProbability === 0
    || !Number.isFinite(probability) || probability >= 100
    || (probability > 0 && env.utils.randomInt(1, 1000000) / 10000 <= probability);
  cache.set(entry.id, matches);
  return matches;
}

function worldbookCandidate(item, env, timing, recursiveText, step, level) {
  const { entry } = item;
  if (!worldbookPositionAvailable(entry, env) || !worldbookContextAllows(entry, env)) return false;
  const text = [env.scan(entry), recursiveText].join('\n');
  const decision = worldbookDecoratorDecision(entry, text, env, timing.matches(item));
  if (decision === 'blocked') return false;
  item.forced = decision === 'forced';
  item.sticky = timing.sticky(item);
  if ((!item.forced || entry._format !== 'v3') && !item.sticky) {
    if (!timing.allows(item)) return false;
    if (step > 0 && entry.excludeRecursion) return false;
    if (entry.delayUntilRecursion && (step === 0 || Number(entry.delayUntilRecursion) > level)) return false;
  }
  if (!item.forced && !item.sticky && !entry.constant && !worldbookEntryMatches(entry, text)) return false;
  item.score = worldbookMatchScore(entry, text);
  return true;
}

async function worldbookResolveEntries(env, items, timing) {
  const remaining = new Map(items.map(item => [item.entry.id, item]));
  const probability = new Map();
  const active = [];
  const levels = [...new Set(items.map(item => Number(item.entry.delayUntilRecursion)).filter(value => value > 0))]
    .sort((a, b) => a - b);
  const configured = Number.isInteger(env.book.max_recursion_steps) ? env.book.max_recursion_steps : 8;
  const maxSteps = Math.min(Math.max(configured, 1), 16);
  let level = 0;
  env.budgetSkipped = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const recursiveText = step === 0 ? '' : active.filter(item => !item.entry.preventRecursion)
      .map(item => item.scanContent).join('\n');
    const candidates = [...remaining.values()].filter(item => (
      worldbookCandidate(item, env, timing, recursiveText, step, level)
    ));
    const grouped = worldbookSelectGroups(candidates, active, env);
    // Group/probability/budget losers cannot seed recursion or reroll during this invocation.
    candidates.forEach(item => remaining.delete(item.entry.id));
    const resolved = await Promise.all(grouped.filter(item => worldbookProbability(item, env, probability)).map(item => item.load()));
    const nonempty = resolved.filter(item => item.content.length > 0 || item.scanContent.trim().length > 0);
    const selected = worldbookApplyBudget(nonempty, env.book.token_budget, worldbookBudgetUsed(active));
    env.budgetSkipped.push(...nonempty.filter(item => !selected.includes(item)).map(item => item.entry.id));
    active.push(...selected);
    if (!env.book.recursive_scanning || !remaining.size) break;
    if (step === 0) level = levels.shift() ?? 0;
    else if (!selected.length) {
      if (!levels.length) break;
      level = levels.shift();
    }
    if (step === maxSteps - 1) env.warn('recursion_limit', null, String(maxSteps));
  }
  return worldbookSortEntries(active);
}
