const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, llmStateContract, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { resolveContent } = require('../../src/shared/game-card/content/contentResolver');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
function readCardFile(relativePath) { return fs.readFileSync(path.join(cardDir, relativePath), 'utf-8'); }

const fileContents = {
  'first_msg.md': '开场',
  'system_prompt.md': readCardFile('system_prompt.md'),
  'roleplay_rules.md': '规则',
  'plot/chapter-1.md': readCardFile('plot/chapter-1.md'),
  'plot/chapter-2.md': readCardFile('plot/chapter-2.md'),
  'plot/chapter-2-game-end1-afterstory.md': readCardFile('plot/chapter-2-game-end1-afterstory.md'),
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
  const init = applyGameCard({ card: loadedCard, phase: 'init', messages: [], state, fileContents });
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [...init.messages, { role: 'user', content: '继续' }],
    state: init.state,
    fileContents
  });
}

describe('white album chapters', () => {
  test('switches to chapter 2 by timeline time and reads chapter 2 plot', async () => {
    const result = await runAtTime('2007.10.25: 17:30 星期四', { setsuna: { affection: 15 } });
    const guide = result.messages.find((msg) => msg.role === 'user');
    const status = result.messages.find((msg) => msg._meta?.source === 'wa2_state_context');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.chapter).toBe('chapter_2');
    expect(result.state.story.progress).toBe('FixedPlot3');
    expect(result.state.timeline.currentSlot).toBe('FixedPlot3');
    expect(result.state.temp.PlotType).toBe('FixedPlot3');
    expect(result.state.story.chapter2SetsunaBranch).toBe('secret');
    expect(result.state.temp.plotFile).toBe('plot.chapter.2');
    expect(result.state.temp).not.toHaveProperty('nodeBgm');
    expect(status.content).not.toContain('story.chapter2SetsunaBranch');
    expect(guide.content).toContain('雪菜盛装出席和春希在KTV碰面');
    expect(guide.content).toContain('### 本节点特殊演出资源');
    expect(guide.content).toContain('visual.scene: `ktv`');
    expect(guide.content).toContain('audio.bgm: `bad_woman`');
    expect(guide.content).not.toContain('本轮自由剧情走向');
  });

  test('uses a reserved Setsuna branch for fixed plot 2 when affection is below 15', async () => {
    const result = await runAtTime('2007.10.25: 16:30 星期四', { setsuna: { affection: 14 } });
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.progress).toBe('FixedPlot2');
    expect(result.state.timeline.currentSlot).toBe('FixedPlot2');
    expect(result.state.temp.PlotType).toBe('FixedPlot2Low');
    expect(result.state.story.chapter2SetsunaBranch).toBe('reserved');
    expect(result.state.timeline.currentSlotEnd).toBe('2007.10.25: 18:00 星期四');
    expect(result.state.temp).not.toHaveProperty('nodeBackground');
    expect(guide.content).toContain('visual.scene: `park`');
    expect(guide.content).toContain('audio.bgm: `snow_scene`');
    expect(guide.content).toContain('雪菜同意加入同好会');
    expect(guide.content).not.toContain('秘密就一个都不剩');
  });

  test('uses a reserved Setsuna branch for fixed plot 3 when affection is below 15', async () => {
    const result = await runAtTime('2007.10.25: 17:30 星期四', { setsuna: { affection: 14 } });
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.progress).toBe('FixedPlot3');
    expect(result.state.timeline.currentSlot).toBe('FixedPlot3');
    expect(result.state.temp.PlotType).toBe('FixedPlot3Low');
    expect(result.state.temp.plotKind).toBe('free');
    expect(result.state.story.chapter2SetsunaBranch).toBe('reserved');
    expect(result.state.timeline.currentSlotEnd).toBe('2007.10.25: 22:00 星期四');
    expect(result.state.audio.bgm).toBe('daily');
    expect(result.state.visual.scene).toBe('musical_classroom3');
    expect(guide.content).toContain('剧情类型：自由剧情节点');
    expect(guide.content).toContain('剧情走向');
    expect(guide.content).not.toContain('秘密就一个都不剩');
  });

  test('loads fixed plot 3 low after the reserved branch is chosen', async () => {
    const result = await runAtTime('2007.10.25: 17:30 星期四', {
      setsuna: { affection: 80 },
      story: { chapter2SetsunaBranch: 'reserved' }
    });
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.progress).toBe('FixedPlot3');
    expect(result.state.timeline.currentSlot).toBe('FixedPlot3');
    expect(result.state.temp.PlotType).toBe('FixedPlot3Low');
    expect(result.state.temp.plotKind).toBe('free');
    expect(result.state.story.chapter2SetsunaBranch).toBe('reserved');
    expect(guide.content).toContain('剧情类型：自由剧情节点');
    expect(guide.content).toContain('剧情走向');
    expect(guide.content).not.toContain('雪菜盛装出席和春希在KTV碰面');
  });

  test('uses fixed plot 7 in the game end slot when both affections are high after the secret branch', async () => {
    const result = await runAtTime('2007.10.28: 21:00 星期日', {
      touma: { affection: 30 },
      setsuna: { affection: 20 },
      performance: { proficiency: 20 },
      story: { chapter2SetsunaBranch: 'secret' }
    });
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.progress).toBe('GameEnd1');
    expect(result.state.timeline.currentSlot).toBe('GameEnd1');
    expect(result.state.temp.PlotType).toBe('FixedPlot7');
    expect(result.state.story.chapter2SuccessReached).toBe(true);
    expect(result.state.story.chapter2GameEnd1Reached).toBe(false);
    expect(result.state.timeline.currentSlotEnd).toBe('2007.10.28: 22:00 星期日');
    expect(guide.content).toContain('visual.scene: `agreement`');
    expect(guide.content).toContain('audio.bgm: `things`');
    expect(guide.content).toContain('重建同好会的剧情完成');
    expect(guide.content).not.toContain('五年后的一个周日夜晚');
  });

  test('keeps game end 1 when the secret branch was not chosen', async () => {
    const result = await runAtTime('2007.10.28: 21:00 星期日', {
      touma: { affection: 80 },
      setsuna: { affection: 80 },
      story: { chapter2SetsunaBranch: 'reserved' }
    });
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.progress).toBe('GameEnd1');
    expect(result.state.temp.PlotType).toBe('GameEnd1');
    expect(result.state.story.chapter2GameEnd1Reached).toBe(true);
    expect(result.state.timeline.currentSlotEnd).toBe('2012.10.28: 22:00 星期日');
    expect(guide.content).toContain('visual.scene: `GameEnd1`');
    expect(guide.content).toContain('五年后的一个周日夜晚');
    expect(guide.content).not.toContain('重建同好会的剧情完成');
  });

  test('uses game end 1 afterstory free plot after game end 1 was loaded', async () => {
    const result = await runAtTime('2007.10.20: 15:00 星期六', {
      story: { chapter2GameEnd1Reached: true }
    });
    const guide = result.messages.find((msg) => msg.role === 'user');
    const status = result.messages.find((msg) => msg._meta?.source === 'wa2_state_context');

    expect(result.trace.errors).toEqual([]);
    expect(result.state.story.chapter).toBe('chapter_2');
    expect(result.state.story.progress).toBe('GameEnd1Afterstory');
    expect(result.state.temp.plotFile).toBe('plot.chapter.2.gameEnd1Afterstory');
    expect(result.state.temp.PlotType).toBe('GameEnd1Afterstory');
    expect(result.state.temp.plotKind).toBe('free');
    expect(result.state.timeline.currentSlotEnd).toBe('2099.12.31: 23:59 星期四');
    expect(status.content).not.toContain('story.chapter2GameEnd1Reached');
    expect(guide.content).toContain('GameEnd1 之后的日后谈');
    expect(guide.content).toContain('禁止加载或续写第二章剩余主线剧情');
    expect(guide.content).not.toContain('经过三人合奏后');
  });

  test('loads the chapter 2 first game ending guide', () => {
    const guide = resolveContent('{{file:plot.chapter.2#GameEnd1}}', {}, { card: loadedCard, fileContents });

    expect(guide).toContain('五年后的一个周日夜晚');
    expect(guide).toContain('许久没有碰过的吉他');
    expect(guide).toContain('另一个平行时空');
  });
});
