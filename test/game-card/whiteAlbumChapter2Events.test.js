const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const readCardFile = (relativePath) => fs.readFileSync(path.join(cardDir, relativePath), 'utf-8');
const fileContents = {
  'first_msg.md': readCardFile('first_msg.md'),
  'system_prompt.md': readCardFile('system_prompt.md'),
  'roleplay_rules.md': readCardFile('roleplay_rules.md'),
  'plot/chapter-1.md': readCardFile('plot/chapter-1.md'),
  'plot/chapter-2.md': readCardFile('plot/chapter-2.md'),
  'state/schema.json': JSON.stringify(stateSchema),
  'state/llm_schema.md': readCardFile('state/llm_schema.md'),
  'state/state_update_rules.md': readCardFile('state/state_update_rules.md'),
  'scripts/plot.js': readCardFile('scripts/plot.js'),
  'scripts/chapters/chapter-1.js': readCardFile('scripts/chapters/chapter-1.js'),
  'scripts/chapters/chapter-2.js': readCardFile('scripts/chapters/chapter-2.js'),
  ...libraryFileContents
};

async function runAt(randomValues, currentTime = '2007.10.25: 08:00 星期四') {
  jest.spyOn(Math, 'random').mockImplementation(() => randomValues.shift() ?? 0);
  const state = ensureStateDefaults(loadedCard.state.schema, { timeline: { currentTime } }).state;
  const init = applyGameCard({ card: loadedCard, phase: 'init', messages: [], state, fileContents });
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [...init.messages, { role: 'user', content: '放学后去唱片店看看' }],
    state: init.state,
    fileContents
  });
}

function latestUserGuide(result) {
  return result.messages.findLast((message) => message.role === 'user').content;
}

describe('white album chapter 2 random events', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    [0, 'touma_setsuna', '自然偶遇、信息或传话'],
    [0.4, 'music', '音乐、练习、同好会成员或演出准备'],
    [0.65, 'friends', '春希与武也、依绪、亲志'],
    [0.85, 'personal', '春希的练琴、通勤、吃饭']
  ])('selects the weighted event category for roll %s', async (eventRandom, category, prompt) => {
    const result = await runAt([0, 0, eventRandom]);
    const guide = latestUserGuide(result);

    expect(result.trace.errors).toEqual([]);
    expect(result.state.temp.plotMood).toBe('tragic');
    expect(result.state.temp.plotEventCategory).toBe(category);
    expect(result.state.temp.plotEventSection).toBe(`PlotEvent_${category}`);
    expect(guide).toContain(prompt);
    expect(guide).toContain('不得产生需要后续处理的新任务');
    expect(guide).toContain('不得以课堂纪律、委员会、学园祭手续');
    expect(guide).toContain('是否能和前文中至少两处线索对应');
  });

  test('keeps winter-album events out of three-person relationship development', async () => {
    const guide = latestUserGuide(await runAt([0, 0, 0]));

    expect(guide).toContain('不得将意外事件的重点写成三人关系的发展或变化');
    expect(guide).toContain('与弱引导同时出现时自然合并');
  });

  test('merges a Setsuna weak guide with a character event', async () => {
    const guide = latestUserGuide(await runAt([0, 0.99, 0]));

    expect(guide).toContain('本轮可以根据用户行动、当前场景和最近剧情');
    expect(guide).toContain('与弱引导同时出现时自然合并');
  });

  test('does not inject an event category for a normal turn', async () => {
    const result = await runAt([0.5, 0]);
    const guide = latestUserGuide(result);

    expect(result.state.temp.plotMood).toBe('normal');
    expect(result.state.temp.plotEventRoll).toBe(0);
    expect(result.state.temp.plotEventCategory).toBe('');
    expect(guide).not.toContain('不得产生需要后续处理的新任务');
  });

  test('does not inject event prompts into a fixed plot', async () => {
    const result = await runAt([0], '2007.10.26: 17:00 星期五');
    const guide = latestUserGuide(result);

    expect(result.state.temp.plotKind).toBe('fixed');
    expect(result.state.temp.plotEventCategory).toBe('');
    expect(guide).not.toContain('不得产生需要后续处理的新任务');
  });
});
