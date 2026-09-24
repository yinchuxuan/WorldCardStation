const definitions = new WeakMap();
function card(id, name, rules = [], extra = {}) {
  const manifest = { formatVersion: '2', version: '1.0', id, name,
    main: 'entry.js', agents: { narrator: 'agents/narrator.json' }, ...extra };
  definitions.set(manifest, {
    'entry.js': `export async function onInput(ctx, input) {
      ctx.state.set('_input', input);
      const call = ctx.agents.call('narrator');
      await call.done();
      const message = ctx.agents.messages('narrator').find(message => message.id === call.messageId);
      await ctx.present(ctx.createReader({ source: message.content, mode: 'continuous' }));
    }`,
    'agents/narrator.json': JSON.stringify({ model: 'default', rules: [
      { when: { phase: 'pre_send' }, then: [{ type: 'insert', role: 'user', content: '{{state:_input}}' }] },
      ...rules
    ] })
  });
  return manifest;
}
const cardFiles = card => definitions.get(card) || {};

function pipelineCard(id = 'pipeline-card') {
  return card(id, 'Pipeline Quest', [
    {
      when: { phase: 'pre_send' },
      then: [
        {
          type: 'insert', predicate: { index: 0 }, anchor: 'before',
          role: 'system', content: 'SYSTEM RULES', ttl: -1,
          _meta: { source: 'game_card', visibility: 'llm_only' }
        },
        {
          type: 'replace', predicate: { index: 'last' },
          content: '[player] {{original_content}}'
        }
      ]
    },
    {
      when: { phase: 'post_response', last: { role: 'assistant' } },
      then: [
        {
          type: 'replace', predicate: { index: 'last' },
          content: "{{original_content}}.regex_replace{pattern:'`',with:'',flags:'g'}"
        },
        {
          type: 'insert', predicate: { index: 'last' }, anchor: 'after',
          role: 'system', content: 'temporary hint', ttl: 2,
          _meta: { source: 'game_card', visibility: 'llm_only' }
        }
      ]
    }
  ]);
}

module.exports = { card, pipelineCard, cardFiles };
