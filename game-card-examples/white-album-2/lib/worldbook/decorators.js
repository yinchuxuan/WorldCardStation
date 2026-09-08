/* eslint-disable no-unused-vars */
/* global worldbookAnchorRange, worldbookKeyMatches */

const WORLDBOOK_FLAG_DECORATORS = ['activate', 'dont_activate', 'keep_activate_after_match',
  'dont_activate_after_match', 'ignore_on_max_context'];
const WORLDBOOK_NUMBER_DECORATORS = ['activate_only_after', 'activate_only_every', 'depth', 'scan_depth', 'is_greeting'];

function worldbookDecoratorValue(name, value, entry, env) {
  if (entry._format !== 'v3' && !['activate', 'dont_activate'].includes(name)) return undefined;
  if (WORLDBOOK_FLAG_DECORATORS.includes(name)) {
    if (name === 'ignore_on_max_context' && typeof env.args.max_context_reached !== 'boolean') return undefined;
    return value === '' ? true : undefined;
  }
  if (WORLDBOOK_NUMBER_DECORATORS.includes(name)) {
    const number = Number(value);
    if (!value || !Number.isInteger(number)) return undefined;
    if (name === 'activate_only_every' && number <= 0) return undefined;
    if (name !== 'depth' && number < 0) return undefined;
    if (name === 'is_greeting' && !Number.isInteger(env.args.greeting_index)) return undefined;
    return number;
  }
  if (name === 'role') return ['assistant', 'system', 'user'].includes(value) ? value : undefined;
  if (name === 'is_user_icon') return value && env.args.user?.icon !== undefined ? value : undefined;
  if (name === 'additional_keys' || name === 'exclude_keys') {
    const keys = value.split(',').map(key => key.trim()).filter(Boolean);
    return keys.length ? keys : undefined;
  }
  if (name === 'position') {
    const key = { before_desc: 'description', after_desc: 'description', personality: 'personality', scenario: 'scenario' }[value];
    return key && worldbookAnchorRange(env.messages, env.book, key) ? value : undefined;
  }
  // Instruct-only decorators and UI prompt switches have no equivalent in this chat library.
  return undefined;
}

function worldbookParseDecorators(content, entry, env) {
  const decorators = {};
  const body = [];
  let fallback = false;
  let removed = false;
  for (const line of content.split(/\r?\n/)) {
    const match = /^(@{2,3})([a-z_]+)(?:[ \t]+(.*))?[ \t]*$/.exec(line);
    if (!match) { body.push(line); fallback = false; continue; }
    removed = true;
    const [, prefix, name, raw = ''] = match;
    if (prefix === '@@@' && !fallback) continue;
    if (name !== 'additional_keys' && Object.hasOwn(decorators, name)) { fallback = false; continue; }
    const value = worldbookDecoratorValue(name, raw.trim(), entry, env);
    fallback = value === undefined;
    if (fallback) env.warn('ignored_decorator', entry, name);
    else if (name === 'additional_keys') (decorators[name] ??= []).push(value);
    else decorators[name] = value;
  }
  return { decorators, content: removed ? body.join('\n').replace(/^\n+|\n+$/g, '') : content };
}

function worldbookDecorate(entry, decorators) {
  const result = { ...entry, _decorators: decorators };
  if (decorators.scan_depth !== undefined) result.scan_depth = decorators.scan_depth;
  if (decorators.role !== undefined) result.role = decorators.role;
  if (decorators.position !== undefined) result.position = decorators.position;
  else if (decorators.depth !== undefined) { result.position = 'at_depth'; result.depth = decorators.depth; }
  return result;
}

function worldbookDecoratorDecision(entry, text, env, previousMatches) {
  const d = entry._decorators || {};
  if (d.dont_activate_after_match && previousMatches > 1) return 'blocked';
  if (d.activate || (d.keep_activate_after_match && previousMatches > 1)) return 'forced';
  if (d.dont_activate) return 'blocked';
  if (d.activate_only_after !== undefined && env.assistantCount < d.activate_only_after) return 'blocked';
  if (d.activate_only_every && env.assistantCount % d.activate_only_every !== 0) return 'blocked';
  if (d.is_greeting !== undefined && env.args.greeting_index !== d.is_greeting) return 'blocked';
  if (d.is_user_icon !== undefined && env.args.user?.icon !== d.is_user_icon) return 'blocked';
  if (d.ignore_on_max_context && env.args.max_context_reached) return 'blocked';
  const matches = key => worldbookKeyMatches(text, key, entry);
  if (d.additional_keys?.some(keys => !keys.some(matches))) return 'blocked';
  if (!entry.use_regex && d.exclude_keys?.some(matches)) return 'blocked';
  return 'normal';
}
