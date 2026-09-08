import { regexExpression } from './regexTemplates.js';

const HELPERS = String.raw`function tavernRegexEscape(text) {
  return text.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/g, char => {
    const controls = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v', '\f': '\\f', '\0': '\\0' };
    return controls[char] ?? '\\' + char;
  });
}
function tavernRegexHash(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
function tavernApplyRegex(ctx, phase) {
  const history = tavernHistory(ctx.messages);
  const warnings = [];
  for (let index = 0; index < history.length; index += 1) {
    const message = history[index], depth = history.length - 1 - index;
    const previous = message._meta?.tavern_regex;
    const current = previous?.revision === tavernRegexRevision;
    const edited = current && previous.fingerprint !== tavernRegexHash(message.content);
    const applied = new Set(current && Array.isArray(previous.applied) ? previous.applied : []);
    for (const rule of tavernRegexRules) {
      if (!rule.roles.includes(message.role)) continue;
      const latest = index === history.length - 1;
      const eligible = phase === 'pre_send'
        ? rule.mode !== 'source' || (latest && message.role === 'user')
        : latest && message.role === 'assistant' && ['source', 'both'].includes(rule.mode);
      if (!eligible || (rule.minDepth != null && depth < rule.minDepth)
        || (rule.maxDepth != null && depth > rule.maxDepth)) continue;
      if (applied.has(rule.id) && (!edited || !rule.runOnEdit)) continue;
      try {
        if (message.content.length > 100000) throw Error('输入超过 100000 字符');
        const value = rule.apply(message.content, ctx);
        if (value.length > 1000000) throw Error('替换结果超过 1000000 字符');
        message.content = value;
        applied.add(rule.id);
      } catch (error) {
        if (warnings.length < 100) warnings.push({ id: rule.id, message: error.message });
      }
    }
    if (applied.size) message._meta = { ...message._meta, tavern_regex: {
      revision: tavernRegexRevision, applied: [...applied], fingerprint: tavernRegexHash(message.content)
    } };
  }
  return warnings;
}
`;

export function generateRegexScripts(files, rules) {
  if (!rules.length) return;
  const scripts = rules.map(rule => {
    const { pattern, flags, replace, trimStrings, ...metadata } = rule;
    const replacement = regexExpression(replace, { captures: true, trims: trimStrings });
    const apply = `function(text,ctx){const pattern=${regexExpression(pattern)};if(pattern.length>1000)throw Error('正则超过 1000 字符');let size=text.length;return text.replace(new RegExp(pattern,${JSON.stringify(flags)}),(...groups)=>{const named=typeof groups[groups.length-1]==='object'?groups[groups.length-1]:{};const count=groups.length-(typeof groups[groups.length-1]==='object'?3:2);const value=${replacement};size+=value.length-groups[0].length;if(size>1000000)throw Error('替换结果超过 1000000 字符');return value;});}`;
    return `{...${JSON.stringify(metadata)},apply:${apply}}`;
  });
  // A fixed serialization also changes the ledger revision when a card's regex configuration changes.
  files['scripts/regex.js'] = `${HELPERS}\nconst tavernRegexRevision=tavernRegexHash(${JSON.stringify(JSON.stringify(rules))});\nconst tavernRegexRules=[\n${scripts.join(',\n')}\n];`;
}
