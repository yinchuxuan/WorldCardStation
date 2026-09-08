/* eslint-disable no-unused-vars */

function worldbookHistory(messages) {
  return messages.filter(message => (
    ['user', 'assistant'].includes(message.role) && message._meta?.visibility !== 'llm_only'
    && !String(message._meta?.source || '').startsWith('worldbook:')
  ));
}

function worldbookScanText(messages, depth) {
  const count = Math.max(0, depth);
  if (count === 0) return '';
  return worldbookHistory(messages).slice(-count).map(message => (
    String(message.content || '').replace(/\{\{(?:\/\/|comment:|hidden_key:)[\s\S]*?\}\}/gi, '')
  )).join('\n');
}

function worldbookKeyMatches(text, key, entry) {
  if (typeof key !== 'string' || !key.trim()) return false;
  const literal = /^\/([\s\S]*)\/([a-z]*)$/.exec(key);
  try {
    const regex = entry._format === 'sillytavern' ? !!literal : !!entry.use_regex;
    if (regex) {
      // Explicit flags are authoritative, including the absence of i.
      return (literal ? new RegExp(literal[1], literal[2])
        : new RegExp(key, entry.case_sensitive ? '' : 'i')).test(text);
    }
    const haystack = entry.case_sensitive ? text : text.toLowerCase();
    const needle = entry.case_sensitive ? key : key.toLowerCase();
    if (!entry.matchWholeWords || /\s/.test(needle)) return haystack.includes(needle);
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\W)(${escaped})(?:$|\\W)`).test(haystack);
  } catch (_) {
    return false;
  }
}

function worldbookValidRegex(key, entry) {
  try {
    const literal = /^\/([\s\S]*)\/([a-z]*)$/.exec(key);
    if (literal) new RegExp(literal[1], literal[2]);
    else new RegExp(key, entry.case_sensitive ? '' : 'i');
    return true;
  } catch (_) {
    return false;
  }
}

function worldbookEntryMatches(entry, text) {
  if (entry._invalidRegex) return false;
  const primary = Array.isArray(entry.keys) ? entry.keys : [];
  if (!primary.some(key => worldbookKeyMatches(text, key, entry))) return false;
  if (!entry.selective || (entry._format === 'v3' && entry.use_regex)) return true;
  const secondary = Array.isArray(entry.secondary_keys) ? entry.secondary_keys : [];
  if (secondary.length === 0) return true;
  const matches = secondary.map(key => worldbookKeyMatches(text, key, entry));
  switch (Number(entry.selectiveLogic ?? 0)) {
    case 1: return !matches.every(Boolean);
    case 2: return !matches.some(Boolean);
    case 3: return matches.every(Boolean);
    default: return matches.some(Boolean);
  }
}

function worldbookMatchScore(entry, text) {
  const primary = entry.keys.filter(key => worldbookKeyMatches(text, key, entry)).length;
  if (!entry.selective || (entry._format === 'v3' && entry.use_regex)) return primary;
  const secondary = entry.secondary_keys.filter(key => worldbookKeyMatches(text, key, entry)).length;
  const logic = Number(entry.selectiveLogic ?? 0);
  return primary + (logic === 0 || (logic === 3 && secondary === entry.secondary_keys.length) ? secondary : 0);
}
