// Built-in content uses the same loader and Worker as installed cards, not a repository entry.
const manifest = { formatVersion: '1', id: 'default-chat', version: '1', name: '普通聊天',
  main: 'main.js', agents: { chat: 'chat.json' }, statePatch: { enabled: false } };
const files = {
  'card.json': JSON.stringify(manifest),
  'chat.json': JSON.stringify({ model: 'default', rules: [
    { when: { phase: 'pre_send' }, then: [{ type: 'insert', role: 'user', content: '{{state:input}}' }] }
  ] }),
  'main.js': `export async function onInput(ctx, input) {
    ctx.state.set('input', input);
    const call = ctx.agents.call('chat');
    await ctx.present(ctx.createReader({ source: call.response, mode: 'continuous' }));
    await call.done();
  }`
};

async function readDefaultChatFile(path) {
  if (!Object.hasOwn(files, path)) throw new Error(`Unknown built-in chat resource: ${path}`);
  return files[path];
}

export { manifest as defaultChatCard, readDefaultChatFile };
