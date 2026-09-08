const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, llmStateContract, worldbookFileContents } = require('./whiteAlbumTestCard');
const { applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
function readCardFile(relativePath) { return fs.readFileSync(path.join(cardDir, relativePath), 'utf-8'); }

const fileContents = {
  'roleplay_rules.md': readCardFile('roleplay_rules.md'),
  'plot/chapter-1.md': readCardFile('plot/chapter-1.md'),
  'plot/chapter-2.md': readCardFile('plot/chapter-2.md'),
  'state/schema.json': JSON.stringify(stateSchema),
  'state/llm_schema.md': llmStateContract,
  'state/state_update_rules.md': readCardFile('state/state_update_rules.md'),
  'scripts/timeline.js': readCardFile('scripts/timeline.js'),
  'scripts/timelines/chapter-1.js': readCardFile('scripts/timelines/chapter-1.js'),
  'scripts/timelines/chapter-2.js': readCardFile('scripts/timelines/chapter-2.js'),
  ...worldbookFileContents
};

async function runFinalSlot(proficiency) {
  const state = ensureStateDefaults(loadedCard.state.schema, {
    touma: { affection: 80 },
    setsuna: { affection: 80 },
    performance: { proficiency },
    story: { chapter2SetsunaBranch: 'secret' },
    timeline: { currentTime: '2007.10.28: 21:00 星期日' }
  }).state;
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [{ role: 'user', content: '继续' }],
    state,
    fileContents
  });
}

describe('white album performance proficiency', () => {
  test('exposes performance proficiency to the llm state context', async () => {
    const result = await runFinalSlot(19);
    const status = result.messages.find((msg) => msg._meta?.source === 'wa2_state_context');

    expect(stateSchema.schema['performance.proficiency'].default).toBe(2);
    expect(llmStateContract).toContain('`performance.proficiency`');
    expect(llmStateContract).toContain('演出练习');
    expect(llmStateContract).toContain('`state.inc`');
    expect(status.content).toContain('`performance.proficiency`');
    expect(status.content).toContain('performance.proficiency: 19');
    expect(status.content).toContain('演出熟练度');
  });

  test('falls back to game end 1 when performance proficiency is below 20', async () => {
    const result = await runFinalSlot(19);
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.progress).toBe('GameEnd1');
    expect(result.state.temp.PlotType).toBe('GameEnd1');
    expect(result.state.story.chapter2GameEnd1Reached).toBe(true);
    expect(result.state.timeline.currentSlotEnd).toBe('2012.10.28: 22:00 星期日');
    expect(guide.content).toContain('五年后的一个周日夜晚');
    expect(guide.content).not.toContain('重建同好会的剧情完成');
  });
});
