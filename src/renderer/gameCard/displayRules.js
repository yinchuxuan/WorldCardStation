import { templateText, templateReplacement } from './regexTemplate.js';

const MAX_RULES = 50;
const MAX_PATTERN_LENGTH = 1000;
const MAX_INPUT_LENGTH = 100000;
const MAX_OUTPUT_LENGTH = 1000000;
const ALLOWED_FLAGS = /^[gimsu]*$/;
const STATE_PATCH_PATTERN = /<state_patch>[\s\S]*?<\/state_patch>/g;

function warnRule(rule, message) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`display rule skipped${rule?.id ? ` (${rule.id})` : ''}: ${message}`);
  }
}

function validFlags(flags) {
  if (typeof flags !== 'string' || !ALLOWED_FLAGS.test(flags)) return false;
  return new Set(flags).size === flags.length;
}

function applyRegexReplace(content, rule) {
  if (rule.stage !== 'before_markdown' || rule.type !== 'regex_replace') return content;
  const pattern = templateText(rule.pattern);
  if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN_LENGTH) {
    warnRule(rule, 'invalid pattern');
    return content;
  }
  const flags = rule.flags === undefined ? '' : rule.flags;
  if (!validFlags(flags)) {
    warnRule(rule, 'invalid flags');
    return content;
  }
  try {
    let outputLength = content.length;
    const replacement = Array.isArray(rule.replace)
      ? (...args) => {
        const value = templateReplacement(rule.replace, args, rule.trimStrings);
        outputLength += value.length - args[0].length;
        if (outputLength > MAX_OUTPUT_LENGTH) throw Error('replacement output exceeds limit');
        return value;
      }
      : String(rule.replace ?? '');
    const result = content.replace(new RegExp(pattern, flags), replacement);
    if (result.length > MAX_OUTPUT_LENGTH) throw Error('replacement output exceeds limit');
    return result;
  } catch (error) {
    warnRule(rule, error.message || 'regex failed');
    return content;
  }
}

function getRules(display, role) {
  const rules = display?.[role];
  return Array.isArray(rules) ? rules.slice(0, MAX_RULES) : [];
}

function applyDisplayRules(content, display, role, depth) {
  if (typeof content !== 'string' || content.length > MAX_INPUT_LENGTH) return content;
  return getRules(display, role).reduce((text, rule) => {
    if (!rule || typeof rule !== 'object' || rule.enabled === false) return text;
    const min = rule.minDepth ?? undefined, max = rule.maxDepth ?? undefined;
    if (min !== undefined || max !== undefined) {
      if (!Number.isInteger(depth) || (min !== undefined && depth < min)
        || (max !== undefined && depth > max)) return text;
    }
    if (text.length > MAX_INPUT_LENGTH) return text;
    return applyRegexReplace(text, rule);
  }, content);
}

function getAssistantRules(display) {
  return getRules(display, 'assistant');
}

function applyAssistantDisplayRules(content, display, depth) {
  const text = applyDisplayRules(content, display, 'assistant', depth);
  return display?.statePatchEnabled === false ? text : text.replace(STATE_PATCH_PATTERN, '');
}

function applyUserDisplayRules(content, display, depth) {
  return applyDisplayRules(content, display, 'user', depth);
}

export { applyAssistantDisplayRules, applyUserDisplayRules, getAssistantRules, getRules };
