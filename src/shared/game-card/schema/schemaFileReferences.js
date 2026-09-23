import gameCardSchema from './game-card.schema.json' assert { type: 'json' };

function resolvePointer(root, pointer) {
  if (!pointer.startsWith('#/')) return null;
  return pointer.slice(2).split('/').reduce((value, part) => {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    return value?.[key];
  }, root);
}

function childPath(parent, key) {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

function walk(value, schema, path, files, root) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$ref) walk(value, resolvePointer(root, schema.$ref), path, files, root);
  if (schema['x-file'] === true && typeof value === 'string') {
    files.push({ field: path, file: value });
  }
  if (schema['x-directory'] === true && typeof value === 'string') {
    files.push({ field: path, file: value, directory: true });
  }

  ['allOf', 'anyOf', 'oneOf'].forEach(keyword => {
    schema[keyword]?.forEach(branch => walk(value, branch, path, files, root));
  });
  if (schema.then) walk(value, schema.then, path, files, root);
  if (schema.else) walk(value, schema.else, path, files, root);

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => walk(item, schema.items, childPath(path, index), files, root));
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;

  const properties = schema.properties || {};
  Object.entries(properties).forEach(([key, childSchema]) => {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      walk(value[key], childSchema, childPath(path, key), files, root);
    }
  });
  if (!schema.additionalProperties || typeof schema.additionalProperties !== 'object') return;
  Object.entries(value).forEach(([key, child]) => {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      walk(child, schema.additionalProperties, childPath(path, key), files, root);
    }
  });
}

function collectSchemaFileReferences(card, schema = gameCardSchema) {
  const files = [];
  walk(card, schema, '', files, schema);
  return [...new Map(files.filter(item => schema !== gameCardSchema || !item.directory)
    .map(item => [`${item.field}\0${item.file}`, item])).values()];
}

export { collectSchemaFileReferences };
