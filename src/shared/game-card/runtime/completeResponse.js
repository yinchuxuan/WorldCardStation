import { validateResponse } from '../validation/responseValidation.js';

// Parse complete control blocks without executing reading-time patches.
function ordinaryPatches(text) {
  const tags = /<\/?state_patch(?:_stream)?>/g;
  const patches = [];
  let open;
  for (const match of text.matchAll(tags)) {
    const closing = match[0].startsWith('</');
    const name = match[0].replace(/[<>/]/g, '');
    if (!closing) {
      if (open) throw new Error('nested state patch tags');
      open = { name, offset: match.index + match[0].length };
    } else {
      if (!open || open.name !== name) throw new Error('unmatched state patch tag');
      if (name === 'state_patch') patches.push(text.slice(open.offset, match.index));
      open = undefined;
    }
  }
  if (open) throw new Error('unclosed state patch tag');
  return patches;
}

function completeResponse(rawContent, config, store) {
  const before = store.snapshot();
  let candidate = before;
  const updates = [];
  for (const text of ordinaryPatches(rawContent)) {
    const result = store.patch(text, candidate);
    candidate = result.state;
    updates.push(...result.updates);
  }
  // Existing content validation strips ordinary patches; additionally hide reader tags.
  const validationConfig = config && { ...config, rules: config.rules.map(rule => (
    rule.type === 'content.regex' && rule.source !== 'raw' ? { ...rule, source: 'raw' } : rule
  )) };
  const violations = (config?.rules || []).flatMap((rule, index) => validateResponse({
    config: { ...validationConfig, rules: [validationConfig.rules[index]] },
    rawContent: rule.type === 'content.regex' && rule.source !== 'raw'
      ? rawContent.replace(/<state_patch(?:_stream)?>[\s\S]*?<\/state_patch(?:_stream)?>/g, '') : rawContent,
    stateBefore: before, stateAfter: candidate, updates
  }).violations);
  if (violations.some(item => item.onFailure === 'retry')) {
    const error = new Error(`response validation failed: ${violations.map(item => item.message).join('; ')}`);
    error.violations = violations;
    throw error;
  }
  store.replace(candidate);
  return violations;
}

export { completeResponse, ordinaryPatches };
