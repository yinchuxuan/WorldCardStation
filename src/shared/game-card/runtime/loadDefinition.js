import { runtimeDefinitionSchema, validateRuntimeDefinition } from '../schema/runtimeDefinitionSchema.js';
import { collectSchemaFileReferences } from '../schema/schemaFileReferences.js';
import { normalizeStateSchema, validateStatePathValue } from '../state/stateSchema.js';
import { readExpandedJson } from './jsonImports.js';

function fail(file, field, message) {
  throw Object.assign(new Error(`${file}: ${field}: ${message}`), { file, field });
}

async function read(readText, file) {
  try {
    const text = await readText(file);
    if (typeof text !== 'string') throw new Error('expected UTF-8 text');
    return text;
  } catch (error) { fail(file, '$', error.message); }
}

async function readJson(readText, file) {
  const text = await read(readText, file);
  try { return JSON.parse(text); }
  catch (error) { fail(file, '$', `invalid JSON: ${error.message}`); }
}

async function validateFiles(value, kind, file, stat) {
  const errors = validateRuntimeDefinition(value, kind);
  if (errors.length) fail(file, '$', errors.join('; '));
  // Production desktop resources have already been checked by the native loader.
  if (!stat) return;
  for (const reference of collectSchemaFileReferences(value, runtimeDefinitionSchema(kind))) {
    try {
      const expected = reference.directory ? 'directory' : 'file';
      if (await stat(reference.file) !== expected) throw new Error(`expected ${expected}`);
    } catch (error) { fail(file, reference.field, `${reference.file}: ${error.message}`); }
  }
}

// Only walk rule containers: ordinary JSON values may legitimately contain a `find` key.
function validateAgentReferences(rules, agents, file, path = 'rules') {
  rules.forEach((rule, index) => {
    const location = `${path}[${index}]`;
    rule.find?.forEach((find, position) => {
      if (find.agentId && !Object.hasOwn(agents, find.agentId)) {
        fail(file, `${location}.find[${position}].agentId`, `unknown Agent: ${find.agentId}`);
      }
    });
    if (rule.then) validateAgentReferences(rule.then, agents, file, `${location}.then`);
  });
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Adapters must resolve all paths inside the card root (including realpath checks).
async function loadRuntimeDefinition({ readText, stat, modelIds = [] }) {
  const manifest = await readExpandedJson(readText, 'card.json');
  const card = manifest.value;
  if (card?.formatVersion !== '2') {
    fail('card.json', 'formatVersion', 'unsupported protocol; migrate to formatVersion "2"');
  }
  await validateFiles(card, 'runtimeManifest', 'card.json', stat);
  const agents = {};
  for (const [id, file] of Object.entries(card.agents)) {
    const expanded = await readExpandedJson(readText, file);
    const definition = expanded.value;
    await validateFiles(definition, 'runtimeAgent', file, stat);
    if (definition.model !== 'default' && !modelIds.includes(definition.model)) {
      fail(file, 'model', `unknown platform model configuration: ${definition.model}`);
    }
    validateAgentReferences(definition.rules, card.agents, file);
    agents[id] = { id, file, definition, sources: expanded.sources };
  }
  const stateSchema = card.stateSchema ? await readJson(readText, card.stateSchema)
    : (Object.hasOwn(card.state || {}, 'schema') ? card.state.schema : {});
  const { schema, errors } = normalizeStateSchema(stateSchema);
  Object.entries(schema).forEach(([path, definition]) => {
    if (!Object.hasOwn(definition, 'default')) return;
    const { error } = validateStatePathValue({ [path]: { ...definition, onInvalid: 'error' } }, path, definition.default);
    if (error) errors.push(`schema.${path}.default: ${error}`);
  });
  if (errors.length) fail(card.stateSchema || 'card.json', 'state.schema', errors.join('; '));
  const source = await read(readText, card.main);
  return freeze({ formatVersion: '2', card, main: { path: card.main, source }, agents, stateSchema, sources: manifest.sources });
}

export { loadRuntimeDefinition };
