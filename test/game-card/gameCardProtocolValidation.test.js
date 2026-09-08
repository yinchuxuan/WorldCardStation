const schema = require('../../src/shared/game-card/schema/game-card.schema.json');
const { applyGameCard } = require('../../src/shared/game-card/engine/engine');
const {
  GAME_CARD_SCHEMA_VERSION,
  validateGameCard
} = require('../../src/shared/game-card/schema/validateGameCard');
const {
  collectSchemaFileReferences
} = require('../../src/shared/game-card/schema/schemaFileReferences.js');

function card(overrides = {}) {
  return {
    version: '1.0',
    id: 'protocol-card',
    name: 'Protocol Card',
    rules: [{
      when: { phase: 'pre_send' },
      then: [{ type: 'exec', sourceFile: 'scripts/timeline.js' }]
    }],
    ...overrides
  };
}

describe('unified game card protocol validation', () => {
  test('exposes a schema version independent from the card version', () => {
    expect(GAME_CARD_SCHEMA_VERSION).toBe('1.10.0');
    expect(schema['x-schema-version']).toBe(GAME_CARD_SCHEMA_VERSION);
    expect(card({ version: 'chapter-build-7' }).version).not.toBe(GAME_CARD_SCHEMA_VERSION);
  });

  test('returns the same structural errors before runtime execution', () => {
    const invalidCard = card({ rules: [{ when: { phase: 'unknown' }, then: [] }] });
    const validation = validateGameCard(invalidCard);
    const runtime = applyGameCard({ card: invalidCard, phase: 'pre_send' });

    expect(validation.valid).toBe(false);
    expect(runtime.trace.errors).toEqual(validation.errors);
  });

  test('discovers file references from schema annotations', () => {
    const configured = card({
      stateSchema: 'state/schema.json',
      files: { intro: 'content/intro.md' },
      audio: { bgm: { winter: 'audio/winter.mp3' } },
      visual: {
        stylesheet: 'visual.css',
        background: { school: 'images/school.jpg' },
        cg: { confession: 'images/confession.jpg' },
        portrait: { touma: { normal: 'images/touma.png' } }
      },
      display: { stylesheet: 'display.css' },
      ui: {
        stylesheet: 'ui.css',
        root: { source: 'ui/root.js', style: 'ui/root.css' },
        scripts: { choice: { sourceFile: 'ui/choice.js' } }
      }
    });

    expect(collectSchemaFileReferences(configured)).toEqual(expect.arrayContaining([
      { field: 'stateSchema', file: 'state/schema.json' },
      { field: 'files.intro', file: 'content/intro.md' },
      { field: 'audio.bgm.winter', file: 'audio/winter.mp3' },
      { field: 'visual.background.school', file: 'images/school.jpg' },
      { field: 'visual.cg.confession', file: 'images/confession.jpg' },
      { field: 'visual.portrait.touma.normal', file: 'images/touma.png' },
      { field: 'ui.root.source', file: 'ui/root.js' },
      { field: 'rules[0].then[0].sourceFile', file: 'scripts/timeline.js' }
    ]));
  });
});
