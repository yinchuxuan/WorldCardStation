/* eslint-disable no-unused-vars */
/* global worldbookHash */

function worldbookMacroOptions(value) {
  return value.split(/(?<!\\),/).map(option => option.replace(/\\,/g, ','));
}

function worldbookExpandMacros(text, entry, env) {
  const hidden = [];
  const content = text.replace(/\{\{([\s\S]*?)\}\}/g, (original, expression, offset) => {
    const trimmed = expression.trim();
    const name = trimmed.split(':')[0].toLowerCase();
    const value = trimmed.slice(trimmed.indexOf(':') + 1);
    if (trimmed.startsWith('//') || name === 'comment') return '';
    if (name === 'hidden_key') { hidden.push(value); return ''; }
    if (name === 'char' || name === 'user') {
      const replacement = name === 'char' ? (env.args.character?.nickname || env.args.character?.name) : env.args.user?.name;
      if (typeof replacement === 'string') return replacement;
      env.warn('missing_macro_context', entry, name);
      return original;
    }
    if (['random', 'pick'].includes(name) && trimmed.includes(':')) {
      const payload = value.startsWith(':') ? value.slice(1) : value;
      const options = payload.includes('::') ? payload.split('::') : worldbookMacroOptions(payload);
      const seed = parseInt(worldbookHash([env.history, entry.id, offset, original]), 16);
      const index = name === 'pick' ? seed % options.length : env.utils.randomInt(0, options.length - 1);
      return options[index];
    }
    if (name === 'roll' && /^:?d?[1-9]\d*$/i.test(value)) {
      const sides = Number(value.replace(/^:?d?/i, ''));
      if (Number.isSafeInteger(sides)) return String(env.utils.randomInt(1, sides));
    }
    if (name === 'reverse' && trimmed.includes(':')) return Array.from(value).reverse().join('');
    env.warn('unsupported_macro', entry, name);
    return original;
  });
  return { content, scanContent: [content, ...hidden].join('\n') };
}
