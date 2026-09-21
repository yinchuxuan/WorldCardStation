const { matchesPredicate, matchesWhen } = require('../../src/shared/game-card/engine/predicate');
const { applyAction } = require('../../src/shared/game-card/engine/actions');
const { applyGameCard } = require('../../src/shared/game-card/engine/engine');
const { resolveContent } = require('../../src/shared/game-card/content/contentResolver');

describe('game card additional unit coverage', () => {
  describe('_meta visibility predicate matching', () => {
    test('matches _meta.visibility directly', () => {
      const msg = { role: 'system', content: 'x', _meta: { visibility: 'llm_only' } };
      expect(matchesPredicate({ '_meta.visibility': 'llm_only' }, msg, 0, [msg])).toBe(true);
      expect(matchesPredicate({ '_meta.visibility': 'user_visible' }, msg, 0, [msg])).toBe(false);
    });

    test('matches _meta.visibility with contains and in operators', () => {
      const msg = { role: 'system', content: 'x', _meta: { visibility: 'debug_only' } };
      expect(matchesPredicate({ '_meta.visibility': { contains: 'debug' } }, msg, 0, [msg])).toBe(true);
      expect(matchesPredicate({ '_meta.visibility': { in: ['llm_only', 'debug_only'] } }, msg, 0, [msg])).toBe(true);
      expect(matchesPredicate({ '_meta.visibility': { nin: ['user_visible'] } }, msg, 0, [msg])).toBe(true);
    });
  });

  describe('all true predicate with actions', () => {
    test('replace updates all messages when all true', () => {
      const messages = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'system', content: 'c' }
      ];
      const result = applyAction(messages, {
        type: 'replace', predicate: { all: true }, content: 'replaced'
      });
      expect(result.messages.map((m) => m.content)).toEqual(['replaced', 'replaced', 'replaced']);
      expect(result.trace.matched).toBe(3);
    });

    test('all predicate is vacuously true for empty messages', () => {
      expect(matchesWhen({ phase: 'pre_send', all: { role: 'user' } }, 'pre_send', [])).toBe(true);
    });
  });

  describe('declared file errors', () => {
    test('reports missing declared file content without crashing', () => {
      const result = applyGameCard({
        card: {
          version: '1', id: 'fc-card', name: 'FC',
          files: { missing: 'missing.md' },
          rules: [{
            when: { phase: 'pre_send' },
            then: [{ type: 'insert', predicate: { index: 0 }, role: 'system', content: '{{file:missing}}' }]
          }]
        },
        phase: 'pre_send',
        messages: [{ role: 'user', content: 'start' }],
        fileContents: {}
      });

      expect(result.messages).toEqual([{ role: 'user', content: 'start' }]);
      expect(result.trace.errors.length).toBeGreaterThan(0);
    });
  });

  describe('content resolver edge cases', () => {
    test('regex_replace with empty pattern replaces first empty match', () => {
      const result = resolveContent(
        '{{original_content}}.regex_replace{pattern:\'\',with:\'X\'}',
        { content: 'abc' }
      );
      expect(result).toBe('Xabc');
    });

    test('regex_extract default group returns full match', () => {
      const result = resolveContent(
        '{{original_content}}.regex_extract{pattern:\'\\\\d+\'}',
        { content: 'hp=42' }
      );
      expect(result).toBe('42');
    });

    test('null content returns empty string', () => {
      expect(resolveContent(null)).toBe('');
      expect(resolveContent(undefined)).toBe('');
    });
  });

  describe('debug trace recording', () => {
    test('trace records phase matched rules and action summaries', () => {
      const card = {
        version: '1', id: 'trace-card', name: 'Trace',
        rules: [
          {
            id: 'r1',
            when: { phase: 'pre_send' },
            then: [{ type: 'insert', predicate: { index: 0 }, role: 'system', content: 'rule1' }]
          },
          {
            id: 'r2',
            when: { phase: 'pre_send', length: { gt: 10 } },
            then: [{ type: 'remove', predicate: { all: true } }]
          }
        ]
      };
      const result = applyGameCard({
        card, phase: 'pre_send',
        messages: [{ role: 'user', content: 'hi' }]
      });

      expect(result.trace.phase).toBe('pre_send');
      expect(result.trace.rules).toHaveLength(1);
      expect(result.trace.rules[0]).toMatchObject({
        ruleId: 'r1',
        ruleIndex: 0,
        matched: true
      });
      expect(result.trace.rules[0].summary.messages).toMatchObject({
        before: 1, after: 2, inserted: 1
      });
      expect(result.trace.errors).toEqual([]);
    });

    test('trace records rule errors for invalid actions', () => {
      const card = {
        version: '1', id: 'err-card', name: 'Err',
        rules: [
          {
            id: 'bad',
            when: { phase: 'pre_send' },
            then: [{ type: 'replace' }]
          }
        ]
      };
      const result = applyGameCard({
        card, phase: 'pre_send',
        messages: [{ role: 'user', content: 'hi' }]
      });

      expect(result.trace.errors.length).toBeGreaterThan(0);
      expect(result.trace.errors[0]).toContain('rules[0]');
    });

    test('trace records action applied status', () => {
      const card = {
        version: '1', id: 'applied-card', name: 'Applied',
        rules: [{
          when: { phase: 'pre_send' },
          then: [{ type: 'remove', predicate: { role: 'system' } }]
        }]
      };
      const result = applyGameCard({
        card, phase: 'pre_send',
        messages: [{ role: 'user', content: 'hi' }]
      });

      expect(result.trace.rules[0].actions[0]).toMatchObject({
        type: 'remove', applied: false, matched: 0
      });
    });
  });

  describe('when with empty messages', () => {
    test('any predicate returns false for empty messages', () => {
      expect(matchesWhen({ phase: 'pre_send', any: { role: 'user' } }, 'pre_send', [])).toBe(false);
    });

    test('length 0 matches empty messages', () => {
      expect(matchesWhen({ phase: 'pre_send', length: 0 }, 'pre_send', [])).toBe(true);
    });

    test('last predicate returns false for empty messages', () => {
      expect(matchesWhen({ phase: 'pre_send', last: { role: 'user' } }, 'pre_send', [])).toBe(false);
    });
  });
});
