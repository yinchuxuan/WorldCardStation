// Fixed source text: production minification must not rename generated card functions.
const SOURCE = `function tavernHistory(messages) {
  return messages.filter(message => ['user', 'assistant'].includes(message.role)
    && !['llm_only', 'debug_only'].includes(message._meta?.visibility) && !message._meta?.worldbook_scope);
}

function tavernPick(seed, location, count) {
  let hash = 2166136261;
  for (const char of \`\${seed}:\${location}\`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % count;
}

function tavernGet(variables, key) {
  const value = variables[key] ?? '';
  return typeof value === 'string' && (value.trim() === '' || Number.isNaN(Number(value))) ? value : Number(value);
}

function tavernAdd(variables, key, value) {
  const current = tavernGet(variables, key) || 0;
  try {
    const list = JSON.parse(current);
    if (Array.isArray(list)) { list.push(value); variables[key] = JSON.stringify(list); return list; }
  } catch (_) { /* Non-array values use numeric addition or string concatenation. */ }
  const next = Number.isNaN(Number(value)) || Number.isNaN(Number(current))
    ? String(current || '') + value : Number(current) + Number(value);
  if (typeof next === 'number' && !Number.isFinite(next)) throw new Error('变量运算超出有限数值范围');
  variables[key] = next;
  return next;
}

function tavernFinish(pieces, outlets = {}) {
  return pieces.map(piece => typeof piece === 'string' ? piece : outlets[piece.outlet] ?? '').join('');
}
`;

export function helperSource() { return SOURCE; }
