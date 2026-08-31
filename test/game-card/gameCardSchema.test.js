const fs = require('node:fs');
const path = require('path');
const Ajv = require('ajv');
const { validateGameCard } = require('../../src/shared/game-card/schema/validateGameCard');

const schemaPath = path.join(__dirname, '../../src/shared/game-card/schema/game-card.schema.json');
const schemaText = fs.readFileSync(schemaPath, 'utf8');
const schema = JSON.parse(schemaText);

function compileSchema() {
  return new Ajv({ $data: true, allErrors: true, strict: false }).compile(schema);
}

function compileDefinition(name) {
  const ajv = new Ajv({ $data: true, allErrors: true, strict: false });
  ajv.addSchema(schema);
  return ajv.getSchema(`${schema.$id}#/definitions/${name}`);
}

function minimalCard(overrides = {}) {
  return {
    version: '1',
    id: 'demo-card',
    name: 'Demo Card',
    rules: [
      {
        when: { phase: 'pre_send' },
        then: [{ type: 'remove', predicate: { all: true } }]
      }
    ],
    ...overrides
  };
}

describe('game card schema', () => {
  test('is valid JSON and stays under the file size rule', () => {
    expect(schema.title).toBe('Game Card');
    expect(schemaText.trim().split('\n').length).toBeLessThanOrEqual(200);
  });

  test('accepts first-pass game card rules', () => {
    const validate = compileSchema();
    const card = {
      version: '1',
      id: 'demo-card',
      name: 'Demo Card',
      description: 'Injects rules before the first send.',
      author: 'World Card Station',
      files: { rules: 'worldbook/rules.md' },
      state: { player: { hp: 10 } },
      rules: [
        {
          id: 'bootstrap',
          when: { phase: 'pre_send', length: { lte: 1 } },
          then: [
            {
              type: 'insert',
              predicate: { index: 0 },
              anchor: 'before',
              role: 'system',
              content: '{{file:rules}}',
              ttl: -1,
              _meta: { source: 'game_card', visibility: 'llm_only' }
            }
          ]
        },
        {
          when: {
            phase: 'after_response',
            last: { role: 'assistant' },
            any: { content: { contains: 'start_quest' } }
          },
          then: [
            {
              type: 'replace',
              predicate: { '_meta.source': 'game_card' },
              ttl: 2
            },
            {
              type: 'remove',
              predicate: { or: [{ role: 'system' }, { index: 'last' }] }
            }
          ]
        }
      ]
    };

    expect(validate(card)).toBe(true);
  });

  test('rejects malformed rules', () => {
    const validate = compileSchema();
    const card = {
      version: '1',
      id: 'bad-card',
      name: 'Bad Card',
      rules: [
        {
          when: { phase: 'during_send' },
          then: [{ type: 'replace', predicate: { role: 'user' } }]
        }
      ]
    };

    expect(validate(card)).toBe(false);
  });

  test('rejects unknown top-level and rule fields', () => {
    const validate = compileSchema();

    expect(validate(minimalCard({ extra: true }))).toBe(false);
    expect(validate(minimalCard({
      rules: [
        {
          when: { phase: 'pre_send' },
          then: [{ type: 'remove', predicate: { all: true } }],
          priority: 10
        }
      ]
    }))).toBe(false);
  });

  test('validates action variants and required fields', () => {
    const validate = compileDefinition('action');
    const cases = [
      [{ type: 'insert', predicate: { index: 0 }, role: 'system', content: 'x' }, true],
      [{ type: 'insert', role: 'system', content: 'x' }, true],
      [{ type: 'insert', predicate: { index: 0 }, role: 'tool', content: 'x' }, false],
      [{ type: 'insert', predicate: { index: 0 }, role: 'system' }, false],
      [{ type: 'remove', predicate: { role: 'system' } }, true],
      [{ type: 'remove', predicate: { role: 'system' }, content: 'x' }, false],
      [{ type: 'replace', predicate: { role: 'assistant' }, content: 'x' }, true],
      [{ type: 'replace', predicate: { role: 'assistant' }, ttl: 1 }, true],
      [{ type: 'replace', predicate: { role: 'assistant' } }, false],
      [{ type: 'exec', source: 'return { messages };' }, true],
      [{ type: 'exec', sourceFile: 'scripts/timeline.js' }, true],
      [{ type: 'exec', sourceFile: 'scripts/timeline.js', includes: ['scripts/helper.js'] }, false],
      [{ type: 'exec', source: '' }, false],
      [{ type: 'exec', source: 'return {};', sourceFile: 'scripts/timeline.js' }, false],
      [{ when: { state: { route: 'alice' } }, then: [{ type: 'remove', predicate: { all: true } }] }, true]
    ];

    cases.forEach(([action, expected]) => {
      expect(validate(action)).toBe(expected);
    });
  });

  test('validates when length comparisons and predicates', () => {
    const validateWhen = compileDefinition('when');
    const validatePredicate = compileDefinition('predicate');

    ['init', 'pre_send', 'after_stream', 'after_response'].forEach(phase => {
      expect(validateWhen({ phase, length: 0 })).toBe(true);
    });
    expect(validateWhen({ phase: 'stream_preview', state: { ready: true } })).toBe(false);
    expect(validateWhen({ phase: 'pre_send', length: { gte: 1, lte: 5 } })).toBe(true);
    expect(validateWhen({ phase: 'pre_send', state: { route: 'alice', hp: { lte: 20 } } })).toBe(true);
    expect(validateWhen({ phase: 'pre_send', state: { route: { startsWith: 'a' } } })).toBe(false);
    expect(validateWhen({ phase: 'pre_send', last: { num: 3, role: 'user' } })).toBe(true);
    expect(validateWhen({ phase: 'pre_send', last: { num: 0, role: 'user' } })).toBe(false);
    expect(validateWhen({ phase: 'pre_send', last: { num: 3 } })).toBe(false);
    expect(validateGameCard(minimalCard({
      rules: [{ when: { phase: 'pre_send', last: { num: 2, role: 'user' } }, then: [{ type: 'remove', predicate: { all: true } }] }]
    }))).toEqual({ valid: true, errors: [] });
    expect(validateWhen({ phase: 'pre_send', length: { between: [1, 5] } })).toBe(false);
    expect(validateWhen({ length: 1 })).toBe(false);

    expect(validatePredicate({ content: { regex: '^【' } })).toBe(true);
    expect(validatePredicate({ role: { in: ['user', 'assistant'] } })).toBe(true);
    expect(validatePredicate({ or: [{ role: 'user' }, { not: { index: 'last' } }] })).toBe(true);
    expect(validatePredicate({})).toBe(false);
    expect(validatePredicate({ role: 'tool' })).toBe(false);
    expect(validatePredicate({ content: { startsWith: 'x' } })).toBe(false);
  });

  test('defines persisted runtime message fields', () => {
    const validate = compileDefinition('message');

    expect(validate({
      role: 'system',
      content: 'Pinned rule',
      thinking: 'hidden chain',
      _meta: { source: 'game_card', visibility: 'llm_only' },
      ttl: 3
    })).toBe(true);

    expect(validate({
      role: 'tool',
      content: 'invalid'
    })).toBe(false);
    expect(validate({
      role: 'system',
      content: 'invalid',
      ttl: -2
    })).toBe(false);
    expect(validate({
      role: 'system',
      content: 'invalid',
      _meta: { visibility: 'private' }
    })).toBe(false);
  });
});
