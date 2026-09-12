const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');

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

  test('find selects file context appended only to the latest user message', async () => {
    const card = {
      version: '1', id: 'find-context', name: 'Find Context', files: { plot: 'plot.md' },
      rules: [{
        when: { phase: 'pre_send' },
        find: [{ name: 'section', from: { role: 'assistant', occurrence: 'last' },
          match: { regex: '^section:(.+)$', group: 1 } }],
        then: [{ type: 'replace', predicate: { role: 'user', occurrence: 'last' },
          content: '{{original_content}}\n\n<context>{{file:plot#$temp.find.section}}</context>' }]
      }]
    };
    const result = await applyGameCardAsync({
      card,
      phase: 'pre_send',
      messages: [{ role: 'user', content: '旧输入' }, { role: 'assistant', content: 'section:Scene' },
        { role: 'user', content: '继续' }],
      state: {},
      fileContents: { 'plot.md': '# Plot\n## Scene\n场景引导\n## Other\n其它引导' }
    });

    expect(result.trace.errors).toEqual([]);
    expect(result.messages[0].content).toBe('旧输入');
    expect(result.messages[2].content).toBe('继续\n\n<context>场景引导</context>');
  });
});
