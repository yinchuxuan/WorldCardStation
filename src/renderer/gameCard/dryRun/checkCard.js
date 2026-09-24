import { validateGameCardDiagnostics } from '../../../shared/game-card/schema/validateGameCard.js';
import { isDirectoryScope, requireSafeRelativePath } from '../../../shared/game-card/content/fileScopes.js';
import { createCheckContext, pointer } from './context.js';
import { checkTemplate } from './content.js';
import { checkExec, checkUiRoot } from './scripts.js';
import { checkRuntimeCard } from './runtimeCard.js';

async function regex(pattern, flags, path, ctx) {
  await ctx.check('regex_syntax', { pointer: path }, () => new RegExp(pattern, flags || ''));
}

async function predicate(value, path, ctx) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const next = pointer(path, key);
    if (key === 'not') await predicate(child, next, ctx);
    else if (key === 'or') {
      for (const [index, item] of child.entries()) await predicate(item, pointer(next, index), ctx);
    } else if (typeof child?.regex === 'string') await regex(child.regex, '', pointer(next, 'regex'), ctx);
  }
}

async function when(value, path, ctx) {
  for (const key of ['last', 'any', 'all']) await predicate(value?.[key], pointer(path, key), ctx);
  for (const [key, matcher] of Object.entries(value?.state || {})) {
    if (typeof matcher?.regex === 'string') await regex(matcher.regex, '', `${pointer(`${path}/state`, key)}/regex`, ctx);
  }
}

async function find(value, path, ctx) {
  for (const [index, item] of (value || []).entries()) {
    const next = pointer(path, index);
    await predicate(item.from, pointer(next, 'from'), ctx);
    if (item.match) await regex(item.match.regex, '', `${next}/match/regex`, ctx);
  }
}

async function content(value, path, ctx) {
  if (typeof value === 'string') return checkTemplate(value, { pointer: path }, ctx);
  if (!value) return;
  for (const key of ['prefix', 'suffix', 'default']) await content(value[key], pointer(path, key), ctx);
  for (const key of ['include', 'select']) {
    for (const [index, branch] of (value[key] || []).entries()) {
      const next = pointer(pointer(path, key), index);
      await when(branch.when, pointer(next, 'when'), ctx);
      await content(branch.content, pointer(next, 'content'), ctx);
    }
  }
}

async function actions(items, path, ctx) {
  for (const [index, action] of items.entries()) {
    const next = pointer(path, index);
    await when(action.when, pointer(next, 'when'), ctx);
    await find(action.find, pointer(next, 'find'), ctx);
    await predicate(action.predicate, pointer(next, 'predicate'), ctx);
    if (action.then) await actions(action.then, pointer(next, 'then'), ctx);
    else if (action.type === 'exec') await checkExec(action, { pointer: pointer(next, action.sourceFile ? 'sourceFile' : 'source') }, ctx);
    else if (['insert', 'replace'].includes(action.type)) await content(action.content, pointer(next, 'content'), ctx);
  }
}

async function checkDisplay(card, ctx) {
  for (const role of ['user', 'assistant']) {
    for (const [index, rule] of (card.display?.[role] || []).entries()) {
      const path = `/display/${role}/${index}/pattern`;
      const pattern = Array.isArray(rule.pattern) && rule.pattern.every(part => typeof part === 'string')
        ? rule.pattern.join('') : rule.pattern;
      if (typeof pattern === 'string') await regex(pattern, rule.flags, path, ctx);
      else {
        await regex('', rule.flags, `/display/${role}/${index}/flags`, ctx);
        ctx.warn('dynamic_regex', '正则含 state 片段，最终表达式只能在实际游玩时编译。', { pointer: path });
      }
    }
  }
}

async function checkContent(card, readText, validated = false) {
  const ctx = createCheckContext(card, readText);
  const diagnostics = validated ? [] : validateGameCardDiagnostics(card);
  if (diagnostics.length) {
    return { diagnostics, warnings: [], checked: ['runtime_schema'] };
  }
  for (const [id, scope] of Object.entries(card.files || {})) {
    if (!isDirectoryScope(scope)) continue;
    for (const [index, pattern] of scope.include.entries()) {
      await ctx.check('file_reference', { pointer: `${pointer('/files', id)}/include/${index}` },
        () => requireSafeRelativePath(pattern, 'text scope include'));
    }
  }
  for (const [index, rule] of card.rules.entries()) {
    const path = `/rules/${index}`;
    await when(rule.when, `${path}/when`, ctx);
    await find(rule.find, `${path}/find`, ctx);
    await actions(rule.then, `${path}/then`, ctx);
  }
  await checkDisplay(card, ctx);
  for (const [index, rule] of (card.responseValidation?.rules || []).entries()) {
    await when(rule.when, `/responseValidation/rules/${index}/when`, ctx);
    if (typeof rule.value?.regex === 'string') await regex(rule.value.regex, '', `/responseValidation/rules/${index}/value/regex`, ctx);
  }
  for (const [name, script] of Object.entries(card.ui?.scripts || {})) {
    await checkExec({ sourceFile: typeof script === 'string' ? script : script.sourceFile }, { pointer: pointer('/ui/scripts', name) }, ctx);
  }
  if (card.ui?.root) await checkUiRoot(card.ui.root.source, ctx);
  return { diagnostics: ctx.diagnostics, warnings: ctx.warnings,
    checked: ['runtime_schema', 'content_templates', 'static_file_references', 'regex', 'exec_includes', 'javascript_syntax'] };
}

export { checkCard };

function checkCard(card, readText) {
  return card?.formatVersion !== undefined ? checkRuntimeCard(readText, checkContent) : checkContent(card, readText);
}
