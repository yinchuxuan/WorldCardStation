const MAX_IMPORT_DEPTH = 20;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isImportObject(value) {
  return isPlainObject(value) && Object.keys(value).length === 1 && typeof value.$import === 'string';
}

function hasImportObject(value) {
  if (isImportObject(value)) return true;
  if (Array.isArray(value)) return value.some(hasImportObject);
  if (!isPlainObject(value)) return false;
  return Object.values(value).some(hasImportObject);
}

async function readImport(cardId, importPath, resources) {
  if (!cardId || typeof resources?.readText !== 'function') {
    throw new Error('game card import requires resources.readText');
  }
  const content = await resources.readText(cardId, importPath);
  try {
    return JSON.parse(content || 'null');
  } catch (error) {
    throw new Error(`game card import must be valid JSON: ${error.message}`);
  }
}

async function expandValue(cardId, value, resources, stack) {
  if (isImportObject(value)) {
    if (stack.includes(value.$import)) throw new Error(`circular game card import: ${value.$import}`);
    if (stack.length >= MAX_IMPORT_DEPTH) throw new Error('game card import depth limit exceeded');
    const imported = await readImport(cardId, value.$import, resources);
    return expandValue(cardId, imported, resources, [...stack, value.$import]);
  }
  if (Array.isArray(value)) {
    const items = await Promise.all(value.map((item) => expandValue(cardId, item, resources, stack)));
    return items.flatMap((item, index) => (isImportObject(value[index]) && Array.isArray(item) ? item : [item]));
  }
  if (!isPlainObject(value)) return value;
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, child]) => [key, await expandValue(cardId, child, resources, stack)])
  );
  return Object.fromEntries(entries);
}

async function expandCardImports(card, resources) {
  if (!card || !card.id) return card;
  if (!hasImportObject(card)) return card;
  return expandValue(card.id, card, resources, []);
}

export { expandCardImports };
