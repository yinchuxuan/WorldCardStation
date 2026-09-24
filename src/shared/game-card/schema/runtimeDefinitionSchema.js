import Ajv from 'ajv';
import schema from './game-card.schema.json' assert { type: 'json' };
import { formatSchemaErrors } from './validateGameCard.js';

// Select the player manifest or Agent view from the same source of field constraints.
function runtimeDefinitionSchema(kind) {
  if (!['runtimeManifest', 'runtimeAgent'].includes(kind)) throw new Error(`Unknown definition kind: ${kind}`);
  const definitions = JSON.parse(JSON.stringify(schema.definitions));
  schema['x-runtime-overrides'].forEach(({ path, schema: replacement }) => {
    const parent = path.slice(0, -1).reduce((value, key) => value[key], definitions);
    parent[path.at(-1)] = replacement;
  });
  return { $schema: schema.$schema, $ref: `#/definitions/${kind}`, definitions };
}

const ajv = new Ajv({ $data: true, allErrors: true, strict: false, strictNumbers: true });
const validators = Object.fromEntries(['runtimeManifest', 'runtimeAgent'].map(kind => (
  [kind, ajv.compile(runtimeDefinitionSchema(kind))]
)));

function validateRuntimeDefinition(value, kind) {
  const validate = Object.hasOwn(validators, kind) && validators[kind];
  if (!validate) throw new Error(`Unknown definition kind: ${kind}`);
  return validate(value) ? [] : formatSchemaErrors(validate.errors);
}

export { runtimeDefinitionSchema, validateRuntimeDefinition };
