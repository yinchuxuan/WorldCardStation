import { issue } from './validation.js';

function parseExamples(text, data, userName, report) {
  const roles = new Map([['{{user}}', 'user'], ['{{char}}', 'assistant'], ['user', 'user'],
    ['assistant', 'assistant'], [userName.toLowerCase(), 'user'], [data.name.toLowerCase(), 'assistant'],
    [(data.nickname || data.name).toLowerCase(), 'assistant']]);
  const messages = [];
  for (const block of text.split(/<START>/i).filter(value => value.trim())) {
    let current = null;
    let invalid = false;
    const parsed = [];
    for (const line of block.split(/\r?\n/)) {
      const speaker = /^([^:\n]+):\s*(.*)$/.exec(line);
      const role = speaker && roles.get(speaker[1].trim().toLowerCase());
      if (role) { current = { role, content: speaker[2] }; parsed.push(current); }
      else if (current) current.content += `\n${line}`;
      else if (line.trim()) invalid = true;
    }
    if (invalid || !parsed.length) {
      issue(report, 'example_fallback', 'data.mes_example', '无法可靠识别的示例段落保留为隐藏 system 文本');
      messages.push({ role: 'system', content: block.trim() });
    } else messages.push(...parsed);
  }
  return messages;
}

export function convertFields(data, options, output, compiler, report) {
  const fields = [];
  const add = (key, text, role = 'system', source = `tavern:${key}`, original) => {
    if (!text) return;
    const file = `${key}.md`;
    output[`content/${file}`] = text;
    compiler.compile(key, text, { original });
    fields.push({ key, file, role, source });
  };
  add('system_prompt', data.system_prompt || options.mainPrompt, 'system', 'tavern:system', options.mainPrompt);
  for (const key of ['description', 'personality', 'scenario']) add(key, data[key]);
  parseExamples(data.mes_example, data, options.userName, report).forEach((message, index) => {
    add(`example-${index}`, message.content, message.role, 'tavern:examples');
  });
  [data.first_mes, ...data.alternate_greetings].forEach((text, index) => {
    const key = `greeting-${index}`;
    output[`content/${key}.md`] = text;
    compiler.compile(key, text, {});
  });
  const postHistory = data.post_history_instructions || options.postHistoryPrompt;
  if (postHistory) {
    output['content/post_history_instructions.md'] = postHistory;
    compiler.compile('post_history_instructions', postHistory, { original: options.postHistoryPrompt });
  }
  return { fields, postHistory: !!postHistory, greetingIndex: options.greetingIndex,
    character: { name: data.name, nickname: data.nickname || data.name, tags: data.tags, creator_notes: data.creator_notes } };
}
