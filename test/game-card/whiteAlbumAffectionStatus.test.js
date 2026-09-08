const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, llmStateContract, worldbookFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
function readCardFile(relativePath) { return fs.readFileSync(path.join(cardDir, relativePath), 'utf-8'); }

const fileContents = {
  'first_msg.md': readCardFile('first_msg.md'),
  'system_prompt.md': readCardFile('system_prompt.md'),
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

function state(overrides) {
  return ensureStateDefaults(loadedCard.state.schema, overrides).state;
}

async function run(content, gameState) {
  const init = applyGameCard({ card: loadedCard, phase: 'init', messages: [], state: state({}), fileContents });
  const result = await applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [...init.messages, { role: 'user', content }],
    state: gameState,
    fileContents
  });
  return {
    status: result.messages.find((msg) => msg._meta?.source === 'wa2_state_context').content,
    guide: result.messages.find((msg) => msg.role === 'user').content,
    worldbook: result.messages.find((msg) => msg._meta?.source === 'worldbook:white-album-2').content
  };
}

describe('white album affection status', () => {
  test('writes affection attitudes into the free plot guide', async () => {
    const low = await run('今天去找冬马排练', state({ touma: { affection: 12 }, setsuna: { affection: 65 } }));
    const high = await run('今天去找冬马排练', state({ touma: { affection: 88 }, setsuna: { affection: 90 } }));

    expect(low.status).toContain('touma.affection: 12');
    expect(low.status).toContain('setsuna.affection: 65');
    expect(low.guide).toContain('冬马和纱当前态度');
    expect(low.guide).toContain('小木曾雪菜当前态度');
    expect(high.guide).toContain('冬马和纱当前态度');
  });

  test.each([
    ['chapter 1', { currentTime: '2007.10.21: 16:00 星期日' }],
    ['chapter 2', { currentTime: '2007.10.26: 17:00 星期五' }]
  ])('uses the revised affection thresholds in %s', async (_chapter, fixedTime) => {
    const low = await run('继续', state({
      timeline: fixedTime, touma: { affection: 24 }, setsuna: { affection: 14 }
    }));
    const high = await run('继续', state({
      timeline: fixedTime, touma: { affection: 25 }, setsuna: { affection: 15 }
    }));

    expect(low.guide).toContain('和春希较保持明显距离');
    expect(low.guide).toContain('和春希较为陌生');
    expect(high.guide).toContain('和春希开始熟悉');
    expect(high.guide).toContain('将春希当作好朋友');
  });

  test('keeps Touma and Setsuna worldbook content permanently in prompt', async () => {
    const result = await run('整理今天的值日安排', state({ touma: { affection: 88 }, setsuna: { affection: 90 } }));

    expect(result.worldbook).toContain('冬马和纱');
    expect(result.worldbook).toContain('小木曾雪菜');
    expect(result.worldbook.match(/心理模型:/g)).toHaveLength(2);
    for (const field of ['Formation:', 'Core:', 'Defense:', 'Trigger:']) {
      expect(result.worldbook.match(new RegExp(field, 'g'))).toHaveLength(2);
    }
    expect(result.worldbook).toContain('始终留在春希、冬马与自己组成的三人关系中');
    expect(result.worldbook).toContain('也珍惜雪菜和三人关系');
    expect(result.worldbook).toContain('维系大家的善意与不愿失去位置的私心都是真实的');
    expect(result.worldbook).not.toContain('渴望被明确选择');
    expect(result.worldbook).not.toContain('当前态度');
  });

  test('loads the corresponding teacher worldbook entries on mention', async () => {
    const result = await run('去教职员室找诹访老师和三年E班班主任', state({}));

    expect(result.worldbook).toContain('峰城大附属的学生指导部主任');
    expect(result.worldbook).toContain('峰城大附属三年E班的男性班主任');
    expect(result.worldbook).toContain('原作未公开姓名');
  });
});
