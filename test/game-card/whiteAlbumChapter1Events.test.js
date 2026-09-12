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

async function runAt(currentTime, randomValues) {
  jest.spyOn(Math, 'random').mockImplementation(() => randomValues.shift() ?? 0);
  const state = ensureStateDefaults(loadedCard.state.schema, { timeline: { currentTime } }).state;
  const init = applyGameCard({ card: loadedCard, phase: 'init', messages: [], state, fileContents });
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [...init.messages, { role: 'user', content: '放学后去第三音乐室练吉他' }],
    state: init.state,
    fileContents
  });
}

function latestUserGuide(result) {
  return result.messages.findLast((message) => message.role === 'user').content;
}

describe('white album chapter 1 random events', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    [0, 'recruitment', '候选人、线索'],
    [0.5, 'friends', '春希与武也、依绪、亲志'],
    [0.7, 'school', '上课、班级、执行委员会'],
    [0.85, 'personal', '春希的学习、练琴、通勤']
  ])('selects the weighted event category for roll %s', async (eventRandom, category, prompt) => {
    const result = await runAt('2007.10.20: 15:00 星期六', [0, 0, eventRandom]);
    const guide = latestUserGuide(result);

    expect(result.trace.errors).toEqual([]);
    expect(result.state.temp.plotMood).toBe('tragic');
    expect(result.state.temp.plotEventCategory).toBe(category);
    expect(result.state.temp.plotEventSection).toBe(`PlotEvent_${category}`);
    expect(guide).toContain('先执行并回应用户本轮行动');
    expect(guide).toContain('是否能和前文中至少两处线索对应');
    expect(guide).toContain('是否有在此时此刻发生的理由');
    expect(guide).toContain('事件动机是否符合逻辑');
    expect(guide).toContain(prompt);
    expect(guide).toContain('放学后去第三音乐室练吉他');
  });

  test('does not inject an event category for a normal chapter 1 turn', async () => {
    const result = await runAt('2007.10.20: 15:00 星期六', [0.5, 0]);
    const guide = latestUserGuide(result);

    expect(result.state.temp.plotMood).toBe('normal');
    expect(result.state.temp.plotEventRoll).toBe(0);
    expect(result.state.temp.plotEventCategory).toBe('');
    expect(result.state.temp.plotEventSection).toBe('');
    expect(guide).not.toContain('先执行并回应用户本轮行动');
    expect(guide).not.toContain('本轮意外事件围绕');
  });

  test('offers varied friend-event ingredients without prescribing a plot', async () => {
    const result = await runAt('2007.10.20: 15:00 星期六', [0, 0, 0.5]);
    const guide = latestUserGuide(result);

    expect(guide).toContain('武也广泛的异性交往');
    expect(guide).toContain('朋友间的帮忙或捉弄');
    expect(guide).toContain('放学后吃饭唱歌等集体活动');
    expect(guide).toContain('不要照搬成固定情节');
  });

  test('does not inject chapter 1 event prompts into chapter 2', async () => {
    const result = await runAt('2007.10.25: 08:00 星期四', [0, 0, 0]);
    const guide = latestUserGuide(result);

    expect(result.state.temp.plotMood).toBe('tragic');
    expect(result.state.temp.plotEventCategory).toBe('touma_setsuna');
    expect(guide).not.toContain('候选人、线索、接触、判断或说服');
    expect(guide).not.toContain('武也广泛的异性交往');
  });
});
