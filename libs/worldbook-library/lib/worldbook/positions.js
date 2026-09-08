/* eslint-disable no-unused-vars */

const WORLDBOOK_POSITIONS = ['before_char', 'after_char', 'an_top', 'an_bottom', 'at_depth',
  'before_examples', 'after_examples', 'outlet'];

function worldbookAnchorRange(messages, book, name) {
  const anchor = book.settings.anchors?.[name];
  const sources = Array.isArray(anchor) ? anchor : [anchor];
  const indices = messages.flatMap((message, index) => (
    typeof message._meta?.source === 'string' && sources.includes(message._meta.source) ? [index] : []
  ));
  return indices.length ? { first: indices[0], last: indices.at(-1) } : null;
}

function worldbookDefaultPosition(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return messages.length;
}

function worldbookDepthPosition(messages, depth) {
  if (depth <= 0) return messages.length;
  const indices = messages.flatMap((message, index) => (
    ['user', 'assistant'].includes(message.role) && message._meta?.visibility !== 'llm_only'
    && !String(message._meta?.source || '').startsWith('worldbook:') ? [index] : []
  ));
  return indices[Math.max(0, indices.length - Math.floor(depth))] ?? 0;
}

function worldbookPosition(entry) {
  return Number.isInteger(entry.position) ? WORLDBOOK_POSITIONS[entry.position] : entry.position;
}

function worldbookPositionAvailable(entry, env) {
  const position = worldbookPosition(entry);
  if (position === 'outlet' && (typeof entry.outletName !== 'string' || !entry.outletName.trim())) {
    env.warn('missing_outlet_name', entry);
    return false;
  }
  if (['an_top', 'an_bottom'].includes(position) && !worldbookAnchorRange(env.messages, env.book, 'authors_note')) {
    env.warn('missing_anchor', entry, 'authors_note');
    return false;
  }
  return true;
}

function worldbookLocate(messages, entry, env) {
  const position = worldbookPosition(entry);
  if (position === 'outlet') return null;
  if (position === 'at_depth') return worldbookDepthPosition(messages, Number(entry.depth) || 0);
  const anchorNames = {
    before_char: 'character', after_char: 'character', before_desc: 'description', after_desc: 'description',
    personality: 'personality', scenario: 'scenario', an_top: 'authors_note', an_bottom: 'authors_note',
    before_examples: 'examples', after_examples: 'examples'
  };
  const anchorName = anchorNames[position];
  if (!anchorName) {
    if (entry.position !== undefined) env.warn('unsupported_position', entry, String(entry.position));
    return worldbookDefaultPosition(messages);
  }
  const anchor = worldbookAnchorRange(messages, env.book, anchorName);
  if (!anchor) {
    env.warn('missing_anchor', entry, anchorName);
    // ST suppresses A/N entries when the author's note is disabled.
    if (anchorName === 'authors_note') return null;
    return worldbookDefaultPosition(messages);
  }
  return ['before_char', 'before_desc', 'an_top', 'before_examples'].includes(position)
    ? anchor.first : anchor.last + 1;
}

function worldbookRole(entry) {
  const role = Number.isInteger(entry.role) ? ['system', 'user', 'assistant'][entry.role] : entry.role;
  return ['system', 'user', 'assistant'].includes(role) ? role : 'system';
}
