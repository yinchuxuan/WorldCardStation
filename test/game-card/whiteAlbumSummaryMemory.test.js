const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, worldbookFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeRuntimeStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const read = relativePath => fs.readFileSync(path.join(cardDir, relativePath), 'utf8');
const fileContents = Object.fromEntries(Object.values(card.files)
  .filter(file => typeof file === 'string').map(file => [file, read(file)]));
Object.assign(fileContents, worldbookFileContents);
['scripts/summary-memory.js', 'scripts/timeline.js', 'scripts/timelines/chapter-1.js',
  'scripts/timelines/chapter-2.js'].forEach(file => { fileContents[file] = read(file); });
const loadedCard = mergeRuntimeStateSchema({
  ...card, state: { ...card.state, schema: stateSchema }
});

function baseMessages() {
  return [
    { role: 'system', content: read('system_prompt.md'), _meta: { source: 'wa2_system_prompt' } },
    { role: 'system', content: '# 历史记忆', _meta: { source: 'wa2_summary' } }
  ];
}

function item(priority, knownBy, text) {
  return `<item priority="${priority}" known_by="${knownBy}">${text}</item>`;
}

function summary(...items) { return `<summary>${items.join('')}</summary>`; }

function runMemory(assistantContents, state = {}) {
  return assistantContents.reduce((previous, content) => applyGameCard({
    card: loadedCard, phase: 'after_stream',
    messages: [...baseMessages(), { role: 'assistant', content }],
    state: previous.state, fileContents
  }), { state: ensureStateDefaults(loadedCard.state.schema, state).state });
}

describe('white album structured summary memory', () => {
  test('deduplicates anchors and replaces current event snapshots', () => {
    const anchor = item('anchor', '北原春希,小木曾雪菜',
      '2007.10.24傍晚｜峰城大附属天台：春希与雪菜完成合奏。');
    const first = summary(anchor, item('current_event', '北原春希', '主唱尚未确认。'));
    const second = summary(anchor, item('current_event', '北原春希,小木曾雪菜',
      '主唱为小木曾雪菜，键盘手尚未确认。'));
    const result = runMemory([first, second]);
    const memory = result.state.memory.summary;
    const rendered = result.messages.find(message => message._meta?.source === 'wa2_summary');

    expect(memory.anchor).toHaveLength(1);
    expect(memory.currentEvents).toEqual([{
      knownBy: ['北原春希', '小木曾雪菜'],
      text: '主唱为小木曾雪菜，键盘手尚未确认。'
    }]);
    expect(rendered.content).toContain('## 剧情锚点');
    expect(rendered.content).toContain('[知情：北原春希、小木曾雪菜]');
    expect(rendered.content).not.toContain('主唱尚未确认。');
  });

  test('keeps only the latest twenty recent items', () => {
    const summaries = Array.from({ length: 25 }, (_, index) => summary(item(
      'recent', '北原春希',
      `2007.10.${String(index + 1).padStart(2, '0')}｜峰城大附属：近期事件${index + 1}。`
    )));
    const result = runMemory(summaries);
    const recent = result.state.memory.summary.recent;

    expect(recent).toHaveLength(20);
    expect(recent[0].text).toContain('近期事件6。');
    expect(recent[19].text).toContain('近期事件25。');
  });

  test('preserves current events when omitted and clears them explicitly', () => {
    const state = { memory: { summary: {
      version: 2, anchor: [], recent: [], turn: 2,
      currentEvents: [{ knownBy: ['北原春希'], text: '键盘手尚未确认。' }]
    } } };
    const preserved = runMemory([
      summary(item('recent', '北原春希', '2007.10.30早晨｜三年E班教室：春希继续上课。'))
    ], state);
    expect(preserved.state.memory.summary.currentEvents).toHaveLength(1);

    const cleared = runMemory([
      summary(item('current_event', '公开', '无当前事项。'))
    ], preserved.state);
    expect(cleared.state.memory.summary.currentEvents).toEqual([]);
  });

  test('applies the current assistant summary without removing its message', () => {
    const latest = summary(item('recent', '北原春希',
      '2007.10.30中午｜三年E班教室：尚未进入长期记忆。'));
    const messages = [
      ...baseMessages(),
      { role: 'assistant', content: latest },
    ];
    const result = applyGameCard({
      card: loadedCard, phase: 'after_stream', messages,
      state: ensureStateDefaults(loadedCard.state.schema, {}).state, fileContents
    });

    expect(result.messages.some(message => message.content === latest)).toBe(true);
    expect(result.state.memory.summary.recent).toHaveLength(1);
  });

  test('discards legacy summaries and removes legacy state', () => {
    const messages = [
      baseMessages()[0],
      { role: 'system', content: '历史对话总结（含时间地点）:\n- 已有旧记录。',
        _meta: { source: 'wa2_summary' } },
      { role: 'assistant', content: '旧回复。<summary>旧格式记录。</summary>' },
    ];
    const result = applyGameCard({
      card: loadedCard, phase: 'after_stream', messages,
      state: ensureStateDefaults(loadedCard.state.schema, {
        memory: { summary: { version: 2, anchor: [], currentEvents: [], recent: [],
          turn: 0, legacy: '- 旧版状态记录。' } }
      }).state, fileContents
    });
    const rendered = result.messages.find(message => message._meta?.source === 'wa2_summary');

    expect(rendered.content).toContain('# 历史记忆');
    expect(rendered.content).not.toContain('待迁移的旧版历史');
    expect(rendered.content).not.toContain('已有旧记录');
    expect(rendered.content).not.toContain('旧版状态记录');
    expect(result.state.memory.summary).not.toHaveProperty('legacy');
  });

  test('pre_send removes old assistant messages without reapplying their summaries', async () => {
    const old = summary(item('recent', '北原春希',
      '2007.10.30早晨｜三年E班教室：已经写入记忆。'));
    const latest = summary(item('recent', '北原春希',
      '2007.10.30中午｜三年E班教室：当前回复。'));
    const state = runMemory([old]).state;
    const result = await applyGameCardAsync({
      card: loadedCard, phase: 'pre_send',
      messages: [...baseMessages(), { role: 'assistant', content: old },
        { role: 'assistant', content: latest }, { role: 'user', content: '继续' }],
      state, fileContents
    });

    expect(result.messages.some(message => message.content === old)).toBe(false);
    expect(result.messages.some(message => message.content === latest)).toBe(true);
    expect(result.state.memory.summary).toEqual(state.memory.summary);
  });
});
