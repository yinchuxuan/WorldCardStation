/* eslint-disable no-unused-vars */
/* global worldbookHash */

function worldbookDuration(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function worldbookTiming(env, scopeId, items) {
  const namespace = env.state?.__worldbook;
  if (namespace !== undefined && (!namespace || typeof namespace !== 'object' || Array.isArray(namespace))) {
    throw new Error('state.__worldbook is reserved for worldbook library state');
  }
  const previous = Object.hasOwn(namespace || {}, scopeId) ? namespace[scopeId] : undefined;
  const count = env.history.length;
  const history = env.history.map(message => [message.role, message.content, message.id]);
  const hash = worldbookHash(history);
  const extendsHistory = previous?.version === 1 && previous.count <= count
    && worldbookHash(history.slice(0, previous.count)) === previous.hash;
  const advanced = extendsHistory && count > previous.count;
  const records = new Map();
  for (const item of items.filter(candidate => candidate.persistent)) {
    const stored = Object.hasOwn(previous?.entries || {}, item.entry.id) ? previous.entries[item.entry.id] : undefined;
    const valid = extendsHistory && stored?.signature === item.signature;
    records.set(item.entry.id, valid ? {
      ...stored,
      stickyUntil: advanced ? stored.stickyUntil : 0,
      cooldownUntil: advanced ? stored.cooldownUntil : 0
    } : { signature: item.signature, matches: 0, stickyUntil: 0, cooldownUntil: 0 });
  }
  return {
    matches(item) { return records.get(item.entry.id)?.matches || 0; },
    sticky(item) { return count < (records.get(item.entry.id)?.stickyUntil || 0); },
    allows(item) {
      if (count < worldbookDuration(item.entry.delay)) return false;
      const record = records.get(item.entry.id);
      return !record || count < record.stickyUntil || count >= record.cooldownUntil;
    },
    finish(selected, outlets) {
      for (const item of selected) {
        const record = records.get(item.entry.id);
        if (!record) continue;
        if (record.lastMatch !== hash) record.matches += 1;
        record.lastMatch = hash;
        if (count < record.stickyUntil) continue;
        record.stickyUntil = count + worldbookDuration(item.entry.sticky);
        record.cooldownUntil = record.stickyUntil + worldbookDuration(item.entry.cooldown);
      }
      if (!records.size && !previous && !Object.keys(outlets).length) return undefined;
      const data = { version: 1, count, hash, entries: Object.fromEntries(records), outlets };
      return { ...env.state, __worldbook: { ...namespace, [scopeId]: data } };
    }
  };
}
