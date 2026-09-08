/* eslint-disable no-unused-vars */
/* global worldbookPosition, worldbookLocate, worldbookRole, worldbookExampleMessages */

function worldbookMessageSource(book, scopeId) {
  return `worldbook:${String(book.id || book.name || scopeId)}`;
}

function worldbookInsert(env, scopeId, entries) {
  const { book } = env;
  const source = worldbookMessageSource(book, scopeId);
  const cleaned = env.messages.filter(message => (
    message._meta?.worldbook_scope !== undefined ? message._meta.worldbook_scope !== scopeId
      : message._meta?.source !== source
  ));
  const join = typeof book.join === 'string' ? book.join : '\n\n';
  const prefix = typeof book.prefix === 'string' ? book.prefix : '';
  const suffix = typeof book.suffix === 'string' ? book.suffix : '';
  const slots = new Map();
  const outlets = new Map();
  for (const item of entries) {
    const position = worldbookPosition(item.entry);
    if (position === 'outlet') {
      const name = item.entry.outletName.trim();
      if (!outlets.has(name)) outlets.set(name, []);
      outlets.get(name).push(item.content);
      continue;
    }
    if (!item.content.length) continue;
    const anchor = worldbookLocate(cleaned, item.entry, env);
    if (anchor === null) continue;
    if (!slots.has(anchor)) slots.set(anchor, []);
    const chunks = slots.get(anchor);
    const examples = ['before_examples', 'after_examples'].includes(position);
    const messages = examples ? worldbookExampleMessages(item.content, item.entry, env)
      : [{ role: worldbookRole(item.entry), content: item.content }];
    for (const message of messages) {
      const last = chunks.at(-1);
      if (!examples && last && !last.example && last.role === message.role) last.content += join + message.content;
      else chunks.push({ ...message, example: examples });
    }
  }
  const result = [];
  for (let index = 0; index <= cleaned.length; index += 1) {
    for (const message of slots.get(index) || []) {
      result.push({
        role: message.role, content: prefix + message.content + suffix, ttl: 1,
        _meta: { source, worldbook_scope: scopeId, visibility: 'llm_only' }
      });
    }
    if (index < cleaned.length) result.push(cleaned[index]);
  }
  return { messages: result, outlets: Object.fromEntries([...outlets].map(([name, contents]) => [name, contents.join(join)])) };
}
