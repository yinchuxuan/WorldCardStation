function stateText(state, path) {
  let value = state;
  for (const key of path.split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !value || !Object.hasOwn(value, key)) return '';
    value = value[key];
  }
  return value === undefined || value === null ? '' : String(value);
}

function escapeRegex(value) {
  return value.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/g, char => {
    const controls = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v', '\f': '\\f', '\0': '\\0' };
    return controls[char] ?? `\\${char}`;
  });
}

function bindText(value, state) {
  if (!Array.isArray(value)) return value;
  return value.map(part => {
    if (typeof part === 'string' || !part.state) return part;
    const text = stateText(state, part.state);
    return part.escapeRegex ? escapeRegex(text) : text;
  });
}

function resolveDisplayState(display, state, statePatchEnabled = true) {
  if (!display) return statePatchEnabled ? display : { statePatchEnabled: false };
  const bind = rule => ({ ...rule, pattern: bindText(rule.pattern, state),
    replace: bindText(rule.replace, state),
    trimStrings: rule.trimStrings?.map(text => typeof text === 'string' ? text : { parts: bindText(text.parts, state) }) });
  return { ...display, ...(!statePatchEnabled ? { statePatchEnabled: false } : {}),
    ...(display.user ? { user: display.user.map(bind) } : {}),
    ...(display.assistant ? { assistant: display.assistant.map(bind) } : {}) };
}

function templateText(value) {
  if (!Array.isArray(value)) return value;
  return value.map(part => typeof part === 'string' ? part : '').join('');
}

function templateReplacement(parts, args, trimStrings = []) {
  const named = typeof args[args.length - 1] === 'object' ? args[args.length - 1] : {};
  const count = args.length - (typeof args[args.length - 1] === 'object' ? 3 : 2);
  return parts.map(part => {
    if (typeof part === 'string') return part;
    if (part.capture === undefined) return '';
    let text = String((typeof part.capture === 'number'
      ? (part.capture < count ? args[part.capture] : '') : (Object.hasOwn(named, part.capture) ? named[part.capture] : '')) ?? '');
    for (const trim of trimStrings) text = text.split(templateText(trim.parts ?? trim)).join('');
    return text;
  }).join('');
}

export { resolveDisplayState, templateText, templateReplacement };
