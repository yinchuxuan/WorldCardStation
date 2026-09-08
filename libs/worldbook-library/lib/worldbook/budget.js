/* eslint-disable no-unused-vars */

function worldbookTokenEstimate(content) {
  // Model-independent estimate: ASCII averages four characters; non-ASCII is counted conservatively.
  let units = 0;
  for (const character of content) units += character.codePointAt(0) <= 127 ? 1 : 4;
  return Math.ceil(units / 4);
}

function worldbookPriority(item) {
  const value = item.entry.priority ?? item.entry.insertion_order ?? 0;
  return Number.isFinite(value) ? value : 0;
}

function worldbookSortEntries(items) {
  return items.slice().sort((left, right) => (
    (left.entry.insertion_order ?? 0) - (right.entry.insertion_order ?? 0) || left.index - right.index
  ));
}

function worldbookBudgetUsed(items) {
  return items.reduce((sum, item) => sum + (item.entry.ignoreBudget ? 0 : worldbookTokenEstimate(item.content)), 0);
}

function worldbookApplyBudget(items, tokenBudget, alreadyUsed = 0) {
  const budget = Number.isFinite(tokenBudget) && tokenBudget >= 0 ? tokenBudget : Infinity;
  let used = alreadyUsed;
  const selected = items
    .slice()
    .sort((left, right) => (
      Number(!!right.sticky) - Number(!!left.sticky)
      || Number(right.entry._format === 'sillytavern' && right.entry.constant)
        - Number(left.entry._format === 'sillytavern' && left.entry.constant)
      || worldbookPriority(right) - worldbookPriority(left)
      || left.index - right.index
    ))
    .filter((item) => {
      if (item.entry.ignoreBudget) return true;
      const tokens = worldbookTokenEstimate(item.content);
      if (used + tokens > budget) return false;
      used += tokens;
      return true;
    });
  return worldbookSortEntries(selected);
}
