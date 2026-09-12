const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, llmStateContract, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
function readCardFile(relativePath) { return fs.readFileSync(path.join(cardDir, relativePath), 'utf-8'); }
function user(content) { return { role: 'user', content }; }
const fileContents = {
  'system_prompt.md': readCardFile('system_prompt.md'),
  'first_msg.md': [
    '开场剧情',
    '<summary>',
    '<item priority="anchor" known_by="北原春希">2007.10.20下午｜第三音乐教室：春希决定保留演出。</item>',
    '<item priority="current_event" known_by="北原春希">主唱和键盘手尚未确认。</item>',
    '<item priority="recent" known_by="北原春希">2007.10.20下午｜第三音乐教室：春希补完招募启事。</item>',
    '</summary>',
    'A. 继续交谈',
    'B. 整理录音',
    'C. 暂时沉默',
    'D. 询问心情',
    '<state_patch>[{"type":"state.set","path":"touma.affection","value":18},{"type":"state.set","path":"setsuna.affection","value":5}]</state_patch>'
  ].join('\n'),
  'roleplay_rules.md': '回复时保持白色相簿2的氛围。追加 <state_patch> 并用 state.set 更新 touma.affection 和 setsuna.affection。',
  'plot/chapter-1.md': readCardFile('plot/chapter-1.md'),
  'state/schema.json': JSON.stringify(stateSchema),
  'state/llm_schema.md': llmStateContract,
  'state/state_update_rules.md': readCardFile('state/state_update_rules.md'),
  'scripts/summary-memory.js': readCardFile('scripts/summary-memory.js'),
  'scripts/plot.js': readCardFile('scripts/plot.js'),
  'scripts/chapters/chapter-1.js': readCardFile('scripts/chapters/chapter-1.js'),
  'scripts/chapters/chapter-2.js': readCardFile('scripts/chapters/chapter-2.js'),
  ...libraryFileContents
};
function defaultState(overrides = {}) { return ensureStateDefaults(loadedCard.state.schema, overrides).state; }
function applyWhiteAlbumPhase(phase, messages, state = defaultState()) {
  const apply = phase === 'pre_send' ? applyGameCardAsync : applyGameCard;
  return apply({
    card: loadedCard,
    phase,
    messages,
    state,
    fileContents
  });
}

function initWhiteAlbum() {
  return applyWhiteAlbumPhase('init', []);
}
function applyWhiteAlbum(messages) {
  const init = initWhiteAlbum();
  return applyWhiteAlbumPhase('pre_send', [...init.messages, ...messages]);
}

describe('white album 2 game card', () => {
  test('uses card scripts for memory compression and timeline logic', () => {
    const applySummary = card.rules.find((rule) => rule.id === 'wa2-apply-response-summary');
    const compression = card.rules.find((rule) => rule.id === 'wa2-compress-assistant-history');
    expect(applySummary.when.phase).toBe('after_stream');
    expect(applySummary.then).toContainEqual({
      type: 'exec', sourceFile: 'scripts/summary-memory.js'
    });
    expect(compression.then[0].type).toBe('remove');
    expect(JSON.stringify(card.rules)).toContain('"sourceFile":"scripts/plot.js"');
  });

  test('inserts fixed hidden summary message after the system prompt', () => {
    const result = initWhiteAlbum();

    expect(result.trace.errors).toEqual([]);
    expect(result.messages[0]._meta.source).toBe('wa2_system_prompt');
    expect(result.messages[1].role).toBe('system');
    expect(result.messages[1]._meta.source).toBe('wa2_summary');
    expect(result.messages[1]._meta.visibility).toBe('llm_only');
    expect(result.messages[1].content).toContain('# 历史记忆');
    expect(result.messages[1].content).not.toContain('<summary>');
    expect(result.messages[2].role).toBe('assistant');
    expect(result.messages[2]._meta.source).toBe('wa2_first_msg');
    expect(result.messages[2]._meta.visibility).toBe('user_visible');
    expect(result.messages[2].content).toContain('priority="anchor"');
    expect(result.state.memory.summary.anchor).toHaveLength(1);
    expect(result.messages[1].content).toContain('春希决定保留演出');
    expect(result.messages[2].content).toContain('<state_patch>');
    expect(result.messages[2].content).toContain('"touma.affection"');
    expect(result.messages[2].content).toContain('"setsuna.affection"');
  });

  test('declares Touma and Setsuna affection state and refreshes the status message', async () => {
    const initial = initWhiteAlbum();
    const result = await applyWhiteAlbumPhase(
      'pre_send',
      [...initial.messages, user('查看好感度')],
      defaultState({ touma: { affection: 12 }, setsuna: { affection: 8 } })
    );
    const status = result.messages.find((msg) => msg._meta?.source === 'wa2_state_context');

    expect(card.stateSchema).toBe('state/schema.json');
    expect(stateSchema.schema['touma.affection'].default).toBe(18);
    expect(stateSchema.schema['setsuna.affection'].default).toBe(5);
    expect(status.role).toBe('system');
    expect(status.ttl).toBe(1);
    expect(status._meta.visibility).toBe('llm_only');
    expect(status.content).toContain('State写入契约');
    expect(status.content).toContain('## 剧情结算字段');
    expect(status.content).toContain('## 演出切换字段');
    expect(status.content).toContain('本轮只读边界');
    expect(status.content).toContain('timeline.currentTime: 2007.10.20: 15:00 星期六');
    expect(status.content).not.toContain('timeline.advanceIntent');
    expect(status.content).toContain('touma.affection: 12');
    expect(status.content).toContain('setsuna.affection: 8');
  });

  test('tail roleplay rules tell the llm how to update affection state', async () => {
    const result = await applyWhiteAlbum([user('继续')]);
    const hint = result.messages.find((msg) => msg.role === 'user');
    const stateContext = result.messages.find((msg) => msg._meta?.source === 'wa2_state_context');

    expect(hint.content).toContain('<wa2_turn_context>');
    expect(hint.content).toContain('<state_patch>');
    expect(stateContext.content).toContain('State更新与演出规则');
    expect(stateContext.content).toContain('所有演出资源都必须由模型通过state_patch编排');
    expect(stateContext.content).toContain('touma.affection');
    expect(stateContext.content).toContain('setsuna.affection');
    expect(stateContext.content).toContain('visual.portraits');
    expect(stateContext.content).toContain('visual.scene');
    expect(stateContext.content).toContain('audio.bgm');
    expect(stateContext.content).toContain('人物可写 `touma`（冬马和纱）');
    expect(stateContext.content).toContain('表情可写 `normal`（平静自然）');
  });

  test('runs the card-local worldbook library with its directory config', async () => {
    const result = await applyWhiteAlbum([user('春希想约冬马、雪菜、武也、依绪和柳原朋一起排练')]);
    const worldbook = result.messages.filter((msg) => msg._meta?.source === 'worldbook:white-album-2');
    const rule = card.rules.find((item) => item.id === 'wa2-insert-turn-context');

    expect(result.trace.errors).toEqual([]);
    expect(card.files.worldbook).toEqual({
      directory: 'worldbook', include: ['config.json', 'entries/*.md']
    });
    expect(rule.then[0]).toEqual({
      type: 'exec', sourceFile: 'lib/worldbook/index.js', args: { worldbook: 'worldbook' }
    });
    expect(worldbook).toHaveLength(1);
    expect(worldbook[0].role).toBe('system');
    expect(worldbook[0].ttl).toBe(1);
    expect(worldbook[0].content).toContain('世界书索引:');
    expect(worldbook[0].content).toContain('本轮命中的世界书条目:');
    expect(worldbook[0].content).toContain('北原春希');
    expect(worldbook[0].content).toContain('冬马和纱');
    expect(worldbook[0].content).toContain('小木曾雪菜');
    expect(worldbook[0].content).toContain('饭冢武也');
    expect(worldbook[0].content).toContain('水泽依绪');
    expect(worldbook[0].content).toContain('柳原朋');
  });
});
