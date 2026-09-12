const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

describe('browser game card find runtime', () => {
  test('rule find still resolves after content resolver is loaded', () => {
    const card = {
      version: '1', id: 'find-browser', name: 'Find Browser',
      rules: [{
        when: { phase: 'pre_send' },
        find: [{
          name: 'assistantTime',
          from: { role: 'assistant', content: { regex: '^T:' } },
          match: { regex: '^T:(.+)$', group: 1 }
        }],
        then: [{
          type: 'replace',
          predicate: { role: 'user', index: 'last' },
          content: '{{original_content}} @ {{state:temp.find.assistantTime}}'
        }]
      }]
    };

    const result = applyGameCard({
      card,
      phase: 'pre_send',
      messages: [{ role: 'assistant', content: 'T:2007.10.21: 08:00' }, { role: 'user', content: 'go' }],
      state: {}
    });

    expect(result.trace.errors).toEqual([]);
    expect(result.messages[1].content).toBe('go @ 2007.10.21: 08:00');
  });

  test('rule find can drive action when state updates in browser runtime', () => {
    const card = {
      version: '1', id: 'advance-browser', name: 'Advance Browser',
      state: { schema: { slot: { type: 'enum', values: ['free', 'fixed'], default: 'free' } } },
      rules: [{
        when: { phase: 'pre_send' },
        find: [{
          name: 'assistantTime',
          from: { role: 'assistant', content: { regex: '^T:' } },
          match: { regex: '^T:(.+)$', group: 1 }
        }],
        then: [{
          type: 'state.advance',
          path: 'slot',
          when: { state: { 'temp.find.assistantTime': { gte: '2007.10.21: 14:00' } } }
        }]
      }]
    };

    const result = applyGameCard({
      card,
      phase: 'pre_send',
      messages: [{ role: 'assistant', content: 'T:2007.10.21: 14:00' }, { role: 'user', content: 'go' }],
      state: { slot: 'free' }
    });

    expect(result.trace.errors).toEqual([]);
    expect(result.state.slot).toBe('fixed');
  });

  test('white album browser runtime appends tail context to latest user message', async () => {
    const { card, stateSchema: schema, llmStateContract, libraryFileContents } = require('./whiteAlbumTestCard');
    const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema } });
    const fileContents = {
      'first_msg.md': '开场',
      'system_prompt.md': '系统提示',
      'roleplay_rules.md': '规则',
      'plot/chapter-1.md': '# 剧情引导\n## 剧情大纲\n大纲\n## FreePlot1\n自由节点\n## 剧情限制\n限制',
      'state/schema.json': JSON.stringify(schema),
      'state/llm_schema.md': llmStateContract,
      'state/state_update_rules.md': '规则',
      'scripts/plot.js': 'function run(ctx) { ctx.state.temp = { plotFile: "plot.chapter.1", PlotType: "FreePlot1", plotDirectionRoll: 50, includeFreeGuide: true }; ctx.state.audio.bgm = "normal"; return { state: ctx.state }; }',
      'scripts/chapters/chapter-1.js': '',
      ...libraryFileContents
    };
    const init = applyGameCard({
      card: loadedCard,
      phase: 'init',
      messages: [],
      state: ensureStateDefaults(loadedCard.state.schema, {}).state,
      fileContents
    });
    const result = await applyGameCardAsync({
      card: loadedCard,
      phase: 'pre_send',
      messages: [...init.messages, { role: 'user', content: '继续' }],
      state: init.state,
      fileContents
    });
    const user = result.messages.find((msg) => msg.role === 'user');

    expect(result.trace.errors).toEqual([]);
    expect(user.content).toContain('<wa2_turn_context>');
    expect(user.content).toContain('自由节点');
  });
});
