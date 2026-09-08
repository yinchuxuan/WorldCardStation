import { helperSource } from './scriptHelpers.js';

const INITIALIZE = `function tavernInitialize(ctx) {
  const state = ctx.state.__tavern;
  state.seed ||= ctx.utils.uuid();
  return state;
}
`;
const INIT = `async function tavernInit(ctx) {
  const state = tavernInitialize(ctx);
  if (state.initialized || ctx.messages.length) return { messages: ctx.messages, state: ctx.state };
  const settings = JSON.parse(ctx.files.read('tavern_settings'));
  const key = \`greeting-\${settings.greetingIndex}\`;
  const raw = await ctx.files.readText('tavern_content', \`\${key}.md\`);
  const content = tavernFinish(tavernRender(key, raw, ctx).pieces);
  state.initialized = true;
  if (content) ctx.messages.push({ id: ctx.utils.uuid(), role: 'assistant', content,
    _meta: { source: 'tavern:greeting', visibility: 'user_visible' } });
  return { messages: ctx.messages, state: ctx.state };
}
`;
const PROMPT = `async function tavernPreSend(ctx, withWorldbook, withRegex) {
  tavernInitialize(ctx);
  ctx.messages = ctx.messages.filter(message => !message._meta?.tavern_transient);
  const regexWarnings = withRegex ? tavernApplyRegex(ctx, 'pre_send') : [];
  const settings = JSON.parse(ctx.files.read('tavern_settings'));
  const pending = [];
  const definitions = [];
  const character = { ...settings.character, name: ctx.state.__tavern.character, nickname: ctx.state.__tavern.character };
  for (const field of settings.fields) {
    const raw = await ctx.files.readText('tavern_content', field.file);
    const rendered = tavernRender(field.key, raw, ctx);
    const content = tavernFinish(rendered.pieces);
    const message = { role: field.role, content, ttl: 1,
      _meta: { source: field.source, visibility: 'llm_only', tavern_transient: true } };
    pending.push({ message, pieces: rendered.pieces });
    definitions.push(message);
    if (['description', 'personality', 'scenario'].includes(field.key)) character[field.key] = content;
  }
  ctx.messages = [...definitions, ...ctx.messages];
  let effects = withRegex ? { regex: { warnings: regexWarnings } } : {};
  if (withWorldbook) {
    if (ctx.state.__worldbook?.worldbook) ctx.state.__worldbook.worldbook.outlets = {};
    const cache = new Map();
    const result = await runWorldbook(ctx, { worldbook: 'worldbook', character,
      user: { name: ctx.state.__tavern.user }, greeting_index: settings.greetingIndex,
      generation_type: ctx.event.generation_type || 'normal' }, async ({ entry, field, index, text }) => {
      const key = \`entry:\${entry.id}:\${field}\${index === undefined ? '' : \`:\${index}\`}\`;
      if (!cache.has(key)) {
        const value = tavernRender(key, text, ctx);
        cache.set(key, { content: tavernFinish(value.pieces), scanContent: tavernFinish(value.scanPieces) });
      }
      return cache.get(key);
    });
    ctx.messages = result.messages;
    ctx.state = result.state ?? ctx.state;
    effects = { ...effects, ...result.effects };
  }
  const outlets = ctx.state.__worldbook?.worldbook?.outlets ?? {};
  for (const { message, pieces } of pending) message.content = tavernFinish(pieces, outlets);
  if (settings.postHistory) {
    const raw = await ctx.files.readText('tavern_content', 'post_history_instructions.md');
    const content = tavernFinish(tavernRender('post_history_instructions', raw, ctx).pieces, outlets);
    if (content) ctx.messages.push({ role: 'system', content, ttl: 1,
      _meta: { source: 'tavern:post_history', visibility: 'llm_only', tavern_transient: true } });
  }
  ctx.messages = ctx.messages.filter(message => !message._meta?.tavern_transient || message.content);
  return { messages: ctx.messages, state: ctx.state, effects };
}
`;

export function generateScripts(output, withWorldbook, regex = {}) {
  output['scripts/helpers.js'] = helperSource();
  output['scripts/init.js'] = [
    'include("./helpers.js");', 'include("./render.js");',
    ...(regex.persistent ? ['include("./regex.js");'] : []), INITIALIZE, INIT,
    regex.persistent
      ? 'async function run(ctx) { const result = await tavernInit(ctx); const warnings = tavernApplyRegex({ ...ctx, ...result }, "init"); return { ...result, effects: { regex: { warnings } } }; }'
      : 'async function run(ctx) { return tavernInit(ctx); }'
  ].join('\n');
  output['scripts/prompt.js'] = [
    ...(withWorldbook ? ['include("../lib/worldbook/index.js");'] : []),
    ...(regex.persistent ? ['include("./regex.js");'] : []),
    'include("./helpers.js");', 'include("./render.js");', INITIALIZE, PROMPT,
    `async function run(ctx) { return tavernPreSend(ctx,${!!withWorldbook},${!!regex.persistent}); }`
  ].join('\n');
  if (regex.response) output['scripts/response.js'] = [
    'include("./helpers.js");', 'include("./regex.js");',
    'function run(ctx) { const warnings = tavernApplyRegex(ctx, "after_stream"); return { messages: ctx.messages, effects: { regex: { warnings } } }; }'
  ].join('\n');
}
