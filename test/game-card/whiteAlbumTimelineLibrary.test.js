const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { createExecFiles } = require('../../src/renderer/gameCard/execFiles');

const timelineCard = {
  ...card, state: { schema: stateSchema.schema },
  rules: card.rules.filter(rule => rule.id === 'wa2-resolve-timeline')
};
const fileContents = { ...libraryFileContents };
for (const file of ['scripts/plot.js', 'scripts/chapters/chapter-1.js', 'scripts/chapters/chapter-2.js']) {
  fileContents[file] = fs.readFileSync(path.resolve(__dirname, '../../game-card-examples/white-album-2', file), 'utf8');
}

async function resolve(currentTime, overrides = {}) {
  const state = ensureStateDefaults(stateSchema.schema, {
    ...overrides, timeline: { ...overrides.timeline, currentTime }
  }).state;
  const result = await applyGameCardAsync({
    card: timelineCard, phase: 'pre_send', messages: [{ role: 'user', content: '继续' }], state, fileContents
  });
  expect(result.trace.errors).toEqual([]);
  return { ...result, report: result.trace.rules[0].actions[0].effects.timeline };
}

describe('WA2 with the shared timeline core', () => {
  test('uses a card-specific plot entry and chapter scripts while retaining the shared core', () => {
    const root = path.resolve(__dirname, '../../game-card-examples/white-album-2');
    expect(timelineCard.rules[0].then[0].sourceFile).toBe('scripts/plot.js');
    expect(fileContents['scripts/plot.js']).toContain('include("lib/timeline/core.js")');
    for (const chapter of [1, 2]) {
      expect(fileContents['scripts/plot.js']).toContain(`include("./chapters/chapter-${chapter}.js")`);
      expect(fileContents[`scripts/chapters/chapter-${chapter}.js`]).toContain('selectTimelineSlot');
    }
    expect(fs.existsSync(path.join(root, 'scripts/timeline.js'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'scripts/timelines'))).toBe(false);
  });

  test('co-locates chapter config and prose without widening the timeline scope', async () => {
    const root = path.resolve(__dirname, '../../game-card-examples/white-album-2');
    expect(card.files.timeline).toEqual({
      directory: 'plot', include: ['chapter-1.json', 'chapter-2.json']
    });
    expect(fs.existsSync(path.join(root, 'timeline'))).toBe(false);
    for (const chapter of [1, 2]) {
      expect(fs.existsSync(path.join(root, `plot/chapter-${chapter}.json`))).toBe(true);
      expect(fs.existsSync(path.join(root, `plot/chapter-${chapter}.md`))).toBe(true);
    }
    const prose = fs.readFileSync(path.join(root, 'plot/chapter-1.md'), 'utf8');
    const files = createExecFiles({
      card, fileContents: { ...fileContents, 'plot/chapter-1.md': prose }
    });
    const config = JSON.parse(await files.readText('timeline', 'chapter-1.json'));
    expect(config.slots[0].id).toBe('FreePlot1');
    await expect(files.readText('timeline', 'chapter-1.md')).rejects.toThrow('outside scope timeline');
    expect(files.read('plot.chapter.1')).toBe(prose);
  });

  test.each([
    ['2007.10.21: 14:00', 'chapter_1', 'FreePlot1'],
    ['2007.10.21: 14:01', 'chapter_1', 'FixedPlot1'],
    ['2007.10.21: 16:01', 'chapter_1', 'FreePlot2'],
    ['2007.10.22: 08:00', 'chapter_1', 'FixedPlot2'],
    ['2007.10.22: 08:01', 'chapter_1', 'FreePlot3'],
    ['2007.10.23: 10:00', 'chapter_1', 'FixedPlot3'],
    ['2007.10.23: 10:01', 'chapter_1', 'FreePlot4'],
    ['2007.10.23: 17:00', 'chapter_1', 'FixedPlot4'],
    ['2007.10.23: 17:30', 'chapter_2', 'FixedPlot1'],
    ['2007.10.23: 17:31', 'chapter_2', 'FreePlot1'],
    ['2007.10.25: 17:00', 'chapter_2', 'FixedPlot2'],
    ['2007.10.25: 18:00', 'chapter_2', 'FixedPlot3'],
    ['2007.10.25: 18:01', 'chapter_2', 'FreePlot2'],
    ['2007.10.26: 17:00', 'chapter_2', 'FixedPlot4'],
    ['2007.10.26: 17:30', 'chapter_2', 'FixedPlot5'],
    ['2007.10.26: 17:31', 'chapter_2', 'FreePlot3'],
    ['2007.10.28: 14:00', 'chapter_2', 'FixedPlot6'],
    ['2007.10.28: 21:00', 'chapter_2', 'GameEnd1']
  ])('retains chapter and node selection at %s', async (time, chapter, slot) => {
    const result = await resolve(time);
    expect(result.state.story.chapter).toBe(chapter);
    expect(result.state.timeline.currentSlot).toBe(slot);
    expect(result.report).toMatchObject({ chapter, selected: slot, fallbackUsed: false, warnings: [] });
    expect(result.state.timeline).not.toHaveProperty('data');
  });

  test('clamps before deciding whether to change chapters', async () => {
    const result = await resolve('2007.10.24: 12:00', {
      timeline: { currentSlotEnd: '2007.10.23: 17:00 星期二' }
    });
    expect(result.state.timeline.currentSlot).toBe('FixedPlot4');
    expect(result.state.timeline.currentSlotEnd).toBe('2007.10.23: 17:30 星期二');
    expect(result.report).toMatchObject({
      requestedTime: '2007.10.24: 12:00', currentTime: '2007.10.23: 17:00 星期二',
      clamped: true, chapter: 'chapter_1'
    });
  });

  test('keeps branch locking and alternate plot identity in the card wrapper', async () => {
    const result = await resolve('2007.10.25: 17:30', {
      setsuna: { affection: 80 }, story: { chapter2SetsunaBranch: 'reserved' }
    });
    expect(result.state.story.chapter2SetsunaBranch).toBe('reserved');
    expect(result.state.temp).toMatchObject({ PlotType: 'FixedPlot3Low', plotKind: 'free' });
    expect(result.report).toMatchObject({ selected: 'FixedPlot3', slotId: 'FixedPlot3', plotType: 'FixedPlot3Low' });
  });

  test('the card still chooses success and its subsequent afterstory without moving completion logic into the lib', async () => {
    const ending = await resolve('2007.10.28: 21:00', {
      story: { chapter2SetsunaBranch: 'secret' }, touma: { affection: 30 },
      setsuna: { affection: 20 }, performance: { proficiency: 20 }
    });
    expect(ending.state.story.chapter2SuccessReached).toBe(true);
    expect(ending.report).toMatchObject({ selected: 'GameEnd1', plotType: 'FixedPlot7' });
    const after = await resolve('2007.10.28: 22:00', ending.state);
    expect(after.report).toMatchObject({ selected: 'Chapter2SuccessAfterstory', selectionSkipped: 'afterstory' });
    expect(after.state.temp.plotFile).toBe('plot.chapter.2.successAfterstory');
  });

  test('preserves the old out-of-range fallback but now reports its cause', async () => {
    const result = await resolve('2007.10.29: 12:00');
    expect(result.state.timeline.currentSlot).toBe('FixedPlot1');
    expect(result.report).toMatchObject({ matched: [], fallbackUsed: true });
    expect(result.report.warnings).toEqual(['No slot matched; using fallback FixedPlot1']);
  });

  test('failed config loading does not commit the wrapper’s preliminary time correction', async () => {
    const state = ensureStateDefaults(stateSchema.schema, {
      timeline: { currentTime: '2007.10.24: 12:00', currentSlotEnd: '2007.10.23: 17:00' }
    }).state;
    const result = await applyGameCardAsync({
      card: timelineCard, phase: 'pre_send', messages: [], state,
      fileContents: { ...fileContents, 'plot/chapter-1.json': '{' }
    });
    expect(result.trace.errors[0]).toContain('invalid timeline config timeline/chapter-1.json');
    expect(result.state).toEqual(state);
  });
});
