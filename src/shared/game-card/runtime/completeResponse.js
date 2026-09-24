import { validateResponse } from '../validation/responseValidation.js';
import { createReaderTokenizer } from './readerTokens.js';

// Parse complete control blocks without executing reading-time patches.
function ordinaryPatches(text) {
  return createReaderTokenizer().feed(text, true).filter(token => token.type === 'state_patch').map(token => token.text);
}

function completeResponse(rawContent, config, store, observe = () => {}, statePatchEnabled = true) {
  const before = store.snapshot();
  let candidate = before;
  const updates = [];
  for (const text of statePatchEnabled ? ordinaryPatches(rawContent) : []) {
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
    rawContent: statePatchEnabled && rule.type === 'content.regex' && rule.source !== 'raw'
      ? rawContent.replace(/<state_patch(?:_stream)?>[\s\S]*?<\/state_patch(?:_stream)?>/g, '') : rawContent,
    stateBefore: before, stateAfter: candidate, updates
  }).violations);
  observe('model.response.validation', { violations, candidate, updates });
  if (violations.some(item => item.onFailure === 'retry')) {
    const error = new Error(`response validation failed: ${violations.map(item => item.message).join('; ')}`);
    error.violations = violations;
    throw error;
  }
  store.replace(candidate);
  observe('state_patch.end', { updates });
  return violations;
}

export { completeResponse, ordinaryPatches };
