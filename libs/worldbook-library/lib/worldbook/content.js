/* eslint-disable no-unused-vars */
/* global worldbookNormalize, worldbookParseDecorators, worldbookDecorate, worldbookExpandMacros, worldbookHash */
/* global worldbookValidRegex */

async function worldbookLoad(ctx, scopeId) {
  const source = await ctx.files.readText(scopeId, 'config.json');
  try {
    return worldbookNormalize(JSON.parse(source));
  } catch (error) {
    throw new Error(`invalid worldbook config: ${error.message}`);
  }
}

async function worldbookReadContent(env, scopeId, entry) {
  const file = entry.extensions?.world_card_station?.content_file;
  if (file !== undefined) {
    if (typeof file !== 'string' || !file) throw new Error(`invalid worldbook content_file: ${entry.id}`);
    return env.files.readText(scopeId, file);
  }
  if (typeof entry.content !== 'string') throw new Error(`worldbook entry content is missing: ${entry.id}`);
  return entry.content;
}

async function worldbookRenderText(env, entry, field, text, index) {
  if (!env.renderText) return worldbookExpandMacros(text, entry, env);
  const rendered = await env.renderText({ entry, field, index, text });
  if (typeof rendered?.content !== 'string' || typeof rendered?.scanContent !== 'string') {
    throw new Error(`invalid worldbook rendered text: ${entry.id}/${field}`);
  }
  return rendered;
}

async function worldbookPrepareEntries(env, scopeId) {
  return Promise.all(env.book.entries.map(async (source, index) => {
    if (!source.enabled) return null;
    let raw;
    let loaded;
    const read = async () => {
      if (!loaded) loaded = worldbookReadContent(env, scopeId, source);
      raw = await loaded;
      return raw;
    };
    const metadata = source.extensions?.world_card_station?.decorators;
    if (metadata !== undefined && (!Array.isArray(metadata) || metadata.some(line => typeof line !== 'string'))) {
      throw new Error(`invalid worldbook decorator metadata: ${source.id}`);
    }
    const usesDecorators = source._format !== 'v2' || metadata !== undefined;
    let decorators = {};
    if (usesDecorators) {
      const text = metadata !== undefined ? metadata.join('\n') : await read();
      decorators = worldbookParseDecorators(text, source, env).decorators;
    }
    const entry = worldbookDecorate(source, decorators);
    const persistent = !!(entry.sticky || entry.cooldown || decorators.keep_activate_after_match || decorators.dont_activate_after_match);
    // Timed effects must expire if the Markdown changes, not only if config.json changes.
    if (persistent) await read();
    if (entry.vectorized) env.warn('unsupported_vector_matching', entry);
    if (entry.automationId) env.warn('unsupported_automation', entry, entry.automationId);
    const item = { entry, index, persistent, signature: persistent ? worldbookHash([source, raw]) : undefined };
    for (const key of ['keys', 'secondary_keys']) {
      entry[key] = await Promise.all(entry[key].map(async (value, index) => {
        const expanded = env.renderText || value.includes('{{')
          ? (await worldbookRenderText(env, entry, key, value, index)).content : value;
        return entry._format === 'sillytavern' ? expanded.trim() : expanded;
      }));
    }
    if (entry._format === 'v3' && entry.use_regex) {
      const keys = [...entry.keys, ...(decorators.additional_keys || []).flat()];
      entry._invalidRegex = keys.some(key => !worldbookValidRegex(key, entry));
      if (entry._invalidRegex) env.warn('invalid_regex', entry);
    }
    item.load = async () => {
      if (item.content !== undefined) return item;
      const text = await read();
      const body = usesDecorators ? worldbookParseDecorators(text, source, env).content : text;
      Object.assign(item, await worldbookRenderText(env, entry, 'content', body));
      return item;
    };
    return item;
  })).then(items => items.filter(Boolean));
}
