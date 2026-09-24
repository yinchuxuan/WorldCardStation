const { applyGameCard } = require('../../src/shared/game-card/engine/engine');
const {
  preparePreSendMessages,
  toApiMessages
} = require('../game-card/legacyPipelineHarness.js');

function card(rules) {
  return { version: '1', id: 'rule-composition', name: 'Rule Composition', rules };
}

describe('game card rule composition across messages and turns', () => {
  beforeEach(() => {
    global.platformMock.readGameCardFile.mockClear();
  });

  test('runs matching rules in order and records message summaries', () => {
    const result = applyGameCard({
      card: card([
        {
          when: { phase: 'pre_send', any: { content: { contains: 'quest' } } },
          then: [{ type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system', content: 'rules' }]
        },
        {
          when: { phase: 'pre_send', last: { role: 'user' } },
          then: [{ type: 'replace', predicate: { index: 'last' }, content: 'player: {{original_content}}' }]
        }
      ]),
      phase: 'pre_send',
      messages: [{ role: 'user', content: 'start quest' }]
    });

    expect(result.messages).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'player: start quest' }
    ]);
    expect(result.trace.rules.map(rule => rule.summary.messages)).toEqual([
      expect.objectContaining({ inserted: 1 }),
      expect.objectContaining({ replaced: 1 })
    ]);
  });

  test('removes game card messages and extracts assistant JSON content', () => {
    const result = applyGameCard({
      card: card([{
        when: { phase: 'after_response' },
        then: [
          { type: 'remove', predicate: { '_meta.source': 'game_card' } },
          {
            type: 'replace',
            predicate: { role: 'assistant' },
            content: "{{original_content}}.regex_extract{pattern:'\\\\{.*\\\\}',group:0}"
          }
        ]
      }]),
      phase: 'after_response',
      messages: [
        { role: 'system', content: 'debug', _meta: { source: 'game_card' } },
        { role: 'assistant', content: '```json\n{"ok":true}\n```' }
      ]
    });

    expect(result.messages).toEqual([{ role: 'assistant', content: '{"ok":true}' }]);
    expect(result.trace.rules[0].summary.messages.removed).toBe(1);
  });

  test('pre_send length predicates only affect matching turns', async () => {
    const firstOnly = card([{
      when: { phase: 'pre_send', length: 1 },
      then: [{ type: 'replace', predicate: { index: 'last' }, content: 'FIRST: {{original_content}}' }]
    }]);

    const first = await preparePreSendMessages({
      card: firstOnly,
      messages: [{ role: 'user', content: 'first msg' }]
    });
    const second = await preparePreSendMessages({
      card: firstOnly,
      messages: [
        { role: 'user', content: 'FIRST: first msg' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'second msg' }
      ]
    });

    expect(first.messages[0].content).toBe('FIRST: first msg');
    expect(second.messages[2].content).toBe('second msg');
  });

  test('pre_send all predicates and API mapping exclude debug-only messages', async () => {
    const result = await preparePreSendMessages({
      card: card([{
        when: { phase: 'pre_send', all: { role: 'user' } },
        then: [
          { type: 'insert', predicate: { index: 0 }, anchor: 'before', role: 'system', content: 'all users', _meta: { visibility: 'llm_only' } },
          { type: 'insert', predicate: { index: 'last' }, anchor: 'after', role: 'system', content: 'debug trace', _meta: { visibility: 'debug_only' } }
        ]
      }]),
      messages: [{ role: 'user', content: 'hello' }]
    });

    expect(result.messages.map(message => message.content)).toEqual(['all users', 'hello', 'debug trace']);
    expect(toApiMessages(result.messages)).toEqual([
      { role: 'system', content: 'all users' },
      { role: 'user', content: 'hello' }
    ]);
  });

});
