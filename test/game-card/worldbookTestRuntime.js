const fs = require('node:fs');
const path = require('node:path');
const { applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { runExecAction } = require('../../src/renderer/gameCard/execRunner');

const root = path.resolve(__dirname, '../../libs/worldbook-library');
const scripts = Object.fromEntries(fs.readdirSync(path.join(root, 'lib/worldbook'))
  .filter(name => name.endsWith('.js'))
  .map(name => [`lib/worldbook/${name}`, fs.readFileSync(path.join(root, 'lib/worldbook', name), 'utf8')]));

const user = content => ({ role: 'user', content });
const assistant = content => ({ role: 'assistant', content });
const entry = (id, extra = {}) => ({ id, keys: ['key'], content: id, enabled: true, insertion_order: 100, ...extra });
const book = (entries, extra = {}) => ({ id: 'demo', entries, ...extra });
const stBook = (entries, extra = {}) => book(entries, {
  extensions: { world_card_station: { format: 'sillytavern' } }, ...extra
});
const v3Book = (entries, extra = {}) => ({ spec: 'lorebook_v3', data: book(entries, extra) });

async function runBook(config, options = {}) {
  const { messages = [user('key')], state = {}, args = {}, files = {}, scope = 'worldbook', random = () => 0.5 } = options;
  const card = {
    version: '1', id: 'worldbook-runtime-test', name: 'Worldbook test',
    files: { [scope]: { directory: 'worldbook', include: ['config.json', 'entries/*.md'] } },
    rules: [{ when: { phase: 'pre_send' }, then: [{
      type: 'exec', sourceFile: 'lib/worldbook/index.js', args: { worldbook: scope, ...args }
    }] }]
  };
  const contents = { 'worldbook/config.json': JSON.stringify(config), ...files };
  const readText = jest.fn(async (filePath) => {
    if (!Object.hasOwn(contents, filePath)) throw new Error(`missing test file: ${filePath}`);
    return contents[filePath];
  });
  const result = await applyGameCardAsync({
    card, phase: 'pre_send', messages, state, fileContents: scripts,
    dependencies: {
      readText,
      runExecAction: (beforeMessages, beforeState, action, runtimeOptions) => (
        runExecAction(beforeMessages, beforeState, action, { ...runtimeOptions, random })
      )
    }
  });
  return { ...result, readText, report: result.trace.rules[0]?.actions[0]?.effects?.worldbook };
}

const selected = result => result.report.selected;
const injected = result => result.messages.filter(message => message._meta?.worldbook_scope !== undefined);

module.exports = { root, scripts, user, assistant, entry, book, stBook, v3Book, runBook, selected, injected };
