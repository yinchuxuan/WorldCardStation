const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, llmStateContract, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');
const { applyLatestAssistantStatePatch } = require('../../src/shared/game-card/state/statePatch');

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
  'scripts/plot.js': readCardFile('scripts/plot.js'),
  'scripts/chapters/chapter-1.js': readCardFile('scripts/chapters/chapter-1.js'),
  'scripts/chapters/chapter-2.js': readCardFile('scripts/chapters/chapter-2.js'),
  ...libraryFileContents
};

function user(content) { return { role: 'user', content }; }

async function runWithRandom(randomValue) {
  jest.spyOn(Math, 'random').mockReturnValue(randomValue);
  const state = ensureStateDefaults(loadedCard.state.schema, {}).state;
  return runWithState(state);
}

async function runAtSlot(currentTime) {
  const state = ensureStateDefaults(loadedCard.state.schema, {
    timeline: { currentTime }
  }).state;
  return runWithState(state);
}

async function runWithState(state) {
  const init = applyGameCard({ card: loadedCard, phase: 'init', messages: [], state, fileContents });
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [...init.messages, user('继续')],
    state: init.state,
    fileContents
  });
}

describe('white album plot direction guide', () => {
  afterEach(() => Math.random.mockRestore && Math.random.mockRestore());

  test('appends plot direction and roleplay rules to the latest user message', async () => {
    const result = await runWithRandom(0.99);
    const userIndex = result.messages.findIndex((msg) => msg.role === 'user');
    const guide = result.messages[userIndex];

    expect(result.trace.errors).toEqual([]);
    expect(result.state.temp.plotDirectionRoll).toBe(100);
    expect(result.state.audio.bgm).toBe('daily');
    expect(result.messages[userIndex - 2]._meta.source).toBe('worldbook:white-album-2');
    expect(result.messages[userIndex - 2].ttl).toBe(1);
    expect(result.messages[userIndex - 1]._meta.source).toBe('wa2_state_context');
    expect(result.messages[userIndex - 1].ttl).toBe(1);
    expect(guide.role).toBe('user');
    expect(guide.content).toContain('继续');
    expect(guide.content).toContain('<wa2_turn_context>');
    expect(guide.content).toContain('剧情目标');
    expect(guide.content).toContain('剧情类型：自由剧情节点');
    expect(guide.content).not.toContain('## 本节点演出资源');
    expect(guide.content).toContain('本轮自由剧情走向: 极度正面');
    expect(guide.content).toContain('根据State更新规则写入本轮结束状态');
    expect(guide.content).toContain('角色扮演规则:');
    expect(result.messages.some((msg) => msg._meta?.source === 'wa2_tail_hint')).toBe(false);
  });

  test.each([
    [0.09, 'tragic'], [0.28, 'sad'], [0.291, 'normal'], [0.691, 'daily'], [0.891, 'happy']
  ])('selects plot mood %s without changing bgm', async (randomValue, mood) => {
    const result = await runWithRandom(randomValue);
    expect(result.state.temp.plotMood).toBe(mood);
    expect(result.state.audio.bgm).toBe('daily');
  });

  test('keeps the model-directed portraits during free and fixed plots', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const freeState = ensureStateDefaults(loadedCard.state.schema, {
      visual: { scene: 'classroom', portraits: { touma: 'laugh' } }, audio: { bgm: 'sad' }
    }).state;
    const fixedState = ensureStateDefaults(loadedCard.state.schema, {
      timeline: { currentTime: '2007.10.21: 16:00 星期日' },
      visual: { scene: 'classroom', portraits: { touma: 'laugh' } }, audio: { bgm: 'sad' }
    }).state;
    const free = await runWithState(freeState);
    const fixed = await runWithState(fixedState);

    expect(free.state).toMatchObject({ visual: freeState.visual, audio: freeState.audio });
    expect(fixed.state).toMatchObject({ visual: fixedState.visual, audio: fixedState.audio });
  });

  test('loads plot guidance from the current timeline time', async () => {
    const opening = await runWithRandom(0.5);
    const guide = opening.messages.find((msg) => msg.role === 'user');

    expect(guide.content).toContain('绝对禁止将时间推进到 2007.10.21: 16:00 星期日 之后');
    expect(guide.content).toContain('剧情类型：自由剧情节点');

    const wall = await runAtSlot('2007.10.21: 16:00 星期日');
    const wallGuide = wall.messages.find((msg) => msg.role === 'user');

    expect(wallGuide.content).toContain('audio.bgm: `WA_piano`');
    expect(wallGuide.content).toContain('当前剧情时间段：2007.10.21: 16:00 星期日 - 2007.10.21: 18:00 星期日');
    expect(wallGuide.content).toContain('隔墙合奏');
    expect(wallGuide.content).not.toContain('本轮自由剧情走向');
    expect(wallGuide.content).toContain('冬马和纱当前态度');
    expect(wallGuide.content).toContain('小木曾雪菜当前态度');

    const free = await runAtSlot('2007.10.21: 18:00 星期日');
    const freeGuide = free.messages.find((msg) => msg.role === 'user');

    expect(freeGuide.content).toContain('绝对禁止将时间推进到 2007.10.22: 8:00 星期一 之后');
    expect(freeGuide.content).toContain('剧情类型：自由剧情节点');
    expect(freeGuide.content).not.toContain('本轮必须完成该剧情节点');
    for (const time of ['2007.10.21: 18:00 星期日', '2007.10.22: 10:00 星期一', '2007.10.23: 12:00 星期二']) {
      const branch = await runAtSlot(time);
      const branchGuide = branch.messages.find((msg) => msg.role === 'user');
      expect(branchGuide.content).toContain('本轮剧情走向');
    }

    const invite = await runAtSlot('2007.10.22: 08:00 星期一');
    const inviteGuide = invite.messages.find((msg) => msg.role === 'user');

    expect(inviteGuide.content).toContain('visual.scene: `invite`');
    expect(inviteGuide.content).not.toContain('audio.bgm:');
    expect(inviteGuide.content).toContain('邀请小木曾雪菜');
    expect(inviteGuide.content).not.toContain('隔墙合奏');
    expect(inviteGuide.content).not.toContain('本轮自由剧情走向');

    const deadline = await runAtSlot('2007.10.23: 10:00 星期二');
    const deadlineGuide = deadline.messages.find((msg) => msg.role === 'user');

    expect(deadlineGuide.content).toContain('visual.scene: `haiku`');
    expect(deadlineGuide.content).not.toContain('audio.bgm:');
    expect(deadlineGuide.content).toContain('今天是学园祭报名节目的截止日期');
    expect(deadlineGuide.content).not.toContain('隔墙合奏');
    expect(deadlineGuide.content).not.toContain('本轮自由剧情走向');

    const rooftop = await runAtSlot('2007.10.23: 17:00 星期二');
    const rooftopGuide = rooftop.messages.find((msg) => msg.role === 'user');

    expect(rooftopGuide.content).toContain('audio.bgm: `WA_3`');
    expect(rooftopGuide.content).toContain('天台上响起了第三个声音');
    expect(rooftopGuide.content).not.toContain('今天是学园祭报名节目的截止日期');
    expect(rooftopGuide.content).not.toContain('本轮自由剧情走向');
  });

  test('llm updates the timeline time with state.set in state patch', async () => {
    const state = ensureStateDefaults(loadedCard.state.schema, {
      timeline: { currentTime: '2007.10.21: 08:00 星期日' }
    }).state;
    const patched = applyLatestAssistantStatePatch([
      {
        role: 'assistant',
        content: '<state_patch>[{"type":"state.set","path":"timeline.currentTime","value":"2007.10.21: 16:00 星期日"}]</state_patch>'
      }
    ], state, { schema: loadedCard.state.schema });
    const result = await runWithState(patched.state);
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(patched.state.timeline.currentTime).toBe('2007.10.21: 16:00 星期日');
    expect(result.state.timeline.currentTime).toBe('2007.10.21: 16:00 星期日');
    expect(guide.content).toContain('隔墙合奏');
  });

  test('keeps current time during fixed slots', async () => {
    const result = await runAtSlot('2007.10.21: 17:00 星期日');
    const guide = result.messages.find((msg) => msg.role === 'user');

    expect(result.state.timeline.currentTime).toBe('2007.10.21: 17:00 星期日');
    expect(guide.content).toContain('剧情类型：自由剧情节点');
    expect(guide.content).toContain('绝对禁止将时间推进到 2007.10.22: 8:00 星期一 之后');
    expect(guide.content).not.toContain('隔墙合奏');
  });

  test('keeps current time during free slots', async () => {
    const early = await runAtSlot('2007.10.22: 06:00 星期一');
    const snapped = await runAtSlot('2007.10.22: 06:01 星期一');
    const guide = snapped.messages.find((msg) => msg.role === 'user');

    expect(early.state.timeline.currentTime).toBe('2007.10.22: 06:00 星期一');
    expect(snapped.state.timeline.currentTime).toBe('2007.10.22: 06:01 星期一');
    expect(guide.content).toContain('剧情类型：固定剧情节点');
    expect(guide.content).toContain('邀请小木曾雪菜');
  });
});
