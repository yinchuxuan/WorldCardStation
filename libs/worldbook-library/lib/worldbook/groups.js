/* eslint-disable no-unused-vars */

function worldbookGroups(entry) {
  return typeof entry.group === 'string' ? entry.group.split(',').map(name => name.trim()).filter(Boolean) : [];
}

function worldbookSelectGroups(items, active, env) {
  const occupied = new Set(active.flatMap(item => worldbookGroups(item.entry)));
  const remaining = new Set(items.filter(item => !worldbookGroups(item.entry).some(name => occupied.has(name))));
  const groups = new Map();
  for (const item of remaining) {
    for (const name of worldbookGroups(item.entry)) {
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
  }
  for (const group of groups.values()) {
    let candidates = group.filter(item => remaining.has(item));
    if (!candidates.length) continue;
    const sticky = candidates.filter(item => item.sticky);
    if (sticky.length) candidates = sticky;
    else if (candidates.some(item => item.entry.useGroupScoring)) {
      const maxScore = Math.max(...candidates.map(item => item.score));
      candidates = candidates.filter(item => !item.entry.useGroupScoring || item.score === maxScore);
    }
    const overrides = candidates.filter(item => item.entry.groupOverride);
    let winner;
    if (overrides.length || sticky.length) {
      winner = (overrides.length ? overrides : candidates).slice().sort((a, b) => (
        (b.entry.insertion_order - a.entry.insertion_order) || a.index - b.index
      ))[0];
    } else {
      const weights = candidates.map(item => Math.max(0, Number(item.entry.groupWeight) || 0));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      if (total > 0) {
        let roll = (env.utils.randomInt(1, 1000000) - 1) / 1000000 * total;
        winner = candidates.find((_, index) => { roll -= weights[index]; return roll < 0; });
      }
    }
    const names = new Set(winner ? worldbookGroups(winner.entry) : []);
    for (const item of remaining) {
      if (item !== winner && (group.includes(item) || worldbookGroups(item.entry).some(name => names.has(name)))) {
        remaining.delete(item);
      }
    }
  }
  return [...remaining];
}
