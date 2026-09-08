/* eslint-disable no-unused-vars */

function worldbookExampleMessages(content, entry, env) {
  const roles = new Map([['user', 'user'], ['assistant', 'assistant']]);
  for (const name of [env.args.character?.name, env.args.character?.nickname]) {
    if (name) roles.set(name.toLowerCase(), 'assistant');
  }
  if (env.args.user?.name) roles.set(env.args.user.name.toLowerCase(), 'user');
  const messages = [];
  let current;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*<START>\s*$/i.test(line)) { current = undefined; continue; }
    const match = /^([^:]+):[ \t]?(.*)$/.exec(line);
    const role = match && roles.get(match[1].trim().toLowerCase());
    if (role) { current = { role, content: match[2] }; messages.push(current); }
    else if (current) current.content += `\n${line}`;
    else if (line.trim()) {
      current = { role: 'system', content: line };
      messages.push(current);
      env.warn('unparsed_example_dialogue', entry);
    }
  }
  return messages.filter(message => message.content.length > 0);
}
