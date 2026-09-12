const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, llmStateContract, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
function readCardFile(relativePath) { return fs.readFileSync(path.join(cardDir, relativePath), 'utf-8'); }

const fileContents = {
  'first_msg.md': '开场',
  'system_prompt.md': readCardFile('system_prompt.md'),
  'roleplay_rules.md': '规则',
  'plot/chapter-1.md': readCardFile('plot/chapter-1.md'),
  'plot/chapter-2.md': readCardFile('plot/chapter-2.md'),
  'state/schema.json': JSON.stringify(stateSchema),
  'state/llm_schema.md': llmStateContract,
  'state/state_update_rules.md': readCardFile('state/state_update_rules.md'),
  'scripts/plot.js': readCardFile('scripts/plot.js'),
  'scripts/chapters/chapter-1.js': readCardFile('scripts/chapters/chapter-1.js'),
  'scripts/chapters/chapter-2.js': readCardFile('scripts/chapters/chapter-2.js'),
  ...libraryFileContents
};

async function applyWithUser(content) {
  const state = ensureStateDefaults(loadedCard.state.schema, {}).state;
  const init = applyGameCard({ card: loadedCard, phase: 'init', messages: [], state, fileContents });
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [...init.messages, { role: 'user', content }],
    state: init.state,
    fileContents
  });
}

describe('white album location worldbook', () => {
  test('loads separate location entries when places are mentioned', async () => {
    const result = await applyWithUser('从峰城大附属中学的第二音乐教室去第三音乐室，之后再去冬马家');
    const worldbook = result.messages.find((msg) => msg._meta?.source === 'worldbook:white-album-2');
    const rule = card.rules.find((item) => item.id === 'wa2-insert-turn-context');

    expect(result.trace.errors).toEqual([]);
    expect(rule.then[0].args).toEqual({ worldbook: 'worldbook' });
    expect(worldbook.content).toContain('地点:');
    expect(worldbook.content).toContain('第二音乐教室: 传说中音乐科的优等生独占的音乐教室');
    expect(worldbook.content).toContain('音乐科优等生独占的教室');
    expect(worldbook.content).toContain('轻音乐同好会实际活动与春希练习吉他的核心地点');
    expect(worldbook.content).toContain('故事主要校园舞台');
    expect(worldbook.content).toContain('冬马和纱独自居住的宽大住宅');
  });
});
