import { matchesWhen } from '../engine/predicate.js';
import { conditionObserver, record } from '../trace/nodes.js';

function resolveWhen(when, options) {
  if (when === undefined) return true;
  const phase = options.event?.phase || when.phase || 'pre_send';
  const normalized = when.phase ? when : { ...when, phase };
  return matchesWhen(normalized, phase, options.messages || [], options.state || {}, conditionObserver(options));
}

function resolveBranchContent(branch, originalMessage, options, resolveContent) {
  return resolveContent(branch.content, originalMessage, { ...options, pointer: `${options.pointer}/content` });
}

function withAffixes(value, content, originalMessage, options, resolveContent) {
  const prefix = content.prefix === undefined ? '' : resolveContent(content.prefix, originalMessage, { ...options, pointer: `${options.pointer}/prefix` });
  const suffix = content.suffix === undefined ? '' : resolveContent(content.suffix, originalMessage, { ...options, pointer: `${options.pointer}/suffix` });
  return prefix + value + suffix;
}

function resolveInclude(content, originalMessage, options, resolveContent) {
  const branches = content.include.map((branch, index) => ({ branch, scoped: { ...options, pointer: `${options.pointer}/include/${index}` } }));
  const parts = branches.filter(({ branch, scoped }) => resolveWhen(branch.when, scoped))
    .map(({ branch, scoped }) => resolveBranchContent(branch, originalMessage, scoped, resolveContent));
  const value = parts.length > 0
    ? parts.join(content.join ?? '\n')
    : resolveContent(content.default ?? '', originalMessage, { ...options, pointer: `${options.pointer}/default` });
  return withAffixes(value, content, originalMessage, options, resolveContent);
}

function resolveSelect(content, originalMessage, options, resolveContent) {
  const index = content.select.findIndex((item, index) => resolveWhen(item.when,
    { ...options, pointer: `${options.pointer}/select/${index}` }));
  const branch = content.select[index];
  if (index >= 0) content.select.slice(index + 1).forEach((_, offset) => record(options, 'content.branch', {
    pointer: `${options.pointer}/select/${index + 1 + offset}`, status: 'not_evaluated', reason: 'short_circuit'
  }));
  const selected = branch
    ? resolveBranchContent(branch, originalMessage, { ...options, pointer: `${options.pointer}/select/${index}` }, resolveContent)
    : resolveContent(content.default ?? '', originalMessage, { ...options, pointer: `${options.pointer}/default` });
  return withAffixes(selected, content, originalMessage, options, resolveContent);
}

function resolveContentObject(content, originalMessage, options, resolveContent) {
  if (Array.isArray(content?.include)) return resolveInclude(content, originalMessage, options, resolveContent);
  if (Array.isArray(content?.select)) return resolveSelect(content, originalMessage, options, resolveContent);
  return '';
}

export { resolveContentObject, resolveWhen };
