const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, llmStateContract, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const readCardFile = relativePath => fs.readFileSync(path.join(cardDir, relativePath), 'utf-8');
const fileContents = {
  'first_msg.md': '开场',
  'roleplay_rules.md': '规则',
  'plot/chapter-1.md': readCardFile('plot/chapter-1.md'),
  'plot/chapter-2.md': readCardFile('plot/chapter-2.md'),
  'plot/chapter-2-game-end1-afterstory.md': readCardFile('plot/chapter-2-game-end1-afterstory.md'),
  'plot/chapter-2-success-afterstory.md': readCardFile('plot/chapter-2-success-afterstory.md'),
  'state/schema.json': JSON.stringify(stateSchema),
  'state/llm_schema.md': llmStateContract,
  'state/state_update_rules.md': readCardFile('state/state_update_rules.md'),
  'scripts/plot.js': readCardFile('scripts/plot.js'),
  'scripts/chapters/chapter-1.js': readCardFile('scripts/chapters/chapter-1.js'),
  'scripts/chapters/chapter-2.js': readCardFile('scripts/chapters/chapter-2.js'),
  ...libraryFileContents
};

async function runAtTime(currentTime, overrides = {}) {
  const state = ensureStateDefaults(loadedCard.state.schema, {
    ...overrides,
    timeline: { ...(overrides.timeline || {}), currentTime }
  }).state;
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [{ role: 'user', content: '继续' }],
    state,
    fileContents
  });
}

describe('white album timeline transitions', () => {
  test.each([
    ['2007.10.23: 16:00 星期二', 'chapter_1', 'FixedPlot4'],
    ['2007.10.23: 17:30 星期二', 'chapter_2', 'FixedPlot1'],
    ['2007.10.25: 17:30 星期四', 'chapter_2', 'FixedPlot3Low'],
    ['2007.10.26: 17:30 星期五', 'chapter_2', 'FixedPlot5'],
    ['2007.10.26: 19:30 星期五', 'chapter_2', 'FreePlot3'],
    ['2007.10.27: 16:00 星期六', 'chapter_2', 'FreePlot3'],
    ['2007.10.27: 20:00 星期六', 'chapter_2', 'FreePlot3'],
    ['2007.10.28: 11:00 星期日', 'chapter_2', 'FreePlot3'],
    ['2007.10.28: 12:00 星期日', 'chapter_2', 'FreePlot3'],
    ['2007.10.28: 13:00 星期日', 'chapter_2', 'FixedPlot6'],
    ['2007.10.28: 14:00 星期日', 'chapter_2', 'FixedPlot6'],
    ['2007.10.28: 21:00 星期日', 'chapter_2', 'GameEnd1']
  ])('resolves %s to %s %s', async (currentTime, chapter, plotType) => {
    const result = await runAtTime(currentTime);

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.chapter).toBe(chapter);
    expect(result.state.temp.PlotType).toBe(plotType);
  });

  test('loads FreePlot3 without leaking the preceding fixed plot', async () => {
    const result = await runAtTime('2007.10.27: 17:30 星期六');
    const guide = result.messages.find(message => message.role === 'user');

    expect(result.state.temp.PlotType).toBe('FreePlot3');
    expect(guide.content).toContain('绝对禁止将时间推进到 2007.10.28: 14:00 星期日 之后');
    expect(guide.content).not.toContain('晚上春希等雪菜下班一同回家');
  });

  test('enters the success afterstory after FixedPlot7', async () => {
    const ending = await runAtTime('2007.10.28: 21:00 星期日', {
      touma: { affection: 30 },
      setsuna: { affection: 20 },
      performance: { proficiency: 20 },
      story: { chapter2SetsunaBranch: 'secret' }
    });
    const afterstory = await runAtTime('2007.10.28: 22:00 星期日', ending.state);
    const guide = afterstory.messages.find(message => message.role === 'user');

    expect(ending.state.temp.PlotType).toBe('FixedPlot7');
    expect(ending.state.story.chapter2SuccessReached).toBe(true);
    expect(afterstory.state.timeline.currentSlot).toBe('Chapter2SuccessAfterstory');
    expect(afterstory.state.temp.PlotType).toBe('Chapter2SuccessAfterstory');
    expect(guide.content).toContain('轻音乐同好会已经成功重建');
    expect(guide.content).toContain('2007.10.28: 22:00 星期日之后');
    expect(guide.content).not.toContain('和雪菜在天台上开始聊天');
  });

  test('keeps plot calendar wording aligned with the revised timeline', () => {
    expect(fileContents['plot/chapter-1.md']).toContain('2007.10.23: 17:00 星期二');
    expect(fileContents['plot/chapter-2.md']).toContain('在周五下午放学时');
    expect(fileContents['plot/chapter-2.md']).toContain('2007.10.29 星期一前凑齐演出人员');
    expect(fileContents['plot/chapter-2.md']).toContain('所以虽然此前回绝了');
    expect(fileContents['plot/chapter-2-game-end1-afterstory.md']).toContain('五年后的周日夜晚');
  });
});
