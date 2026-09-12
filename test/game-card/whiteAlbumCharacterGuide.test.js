const fs = require('node:fs');
const path = require('node:path');
const { card, stateSchema, libraryFileContents } = require('./whiteAlbumTestCard');
const { applyGameCard, applyGameCardAsync } = require('../../src/renderer/gameCard/engine');
const { ensureStateDefaults } = require('../../src/shared/game-card/state/stateSchema');
const { mergeAudioStateSchema } = require('../../src/renderer/gameCard/stateSchemaLoader');

const loadedCard = mergeAudioStateSchema({ ...card, state: { ...card.state, schema: stateSchema } });
const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const readCardFile = (relativePath) => fs.readFileSync(path.join(cardDir, relativePath), 'utf-8');
const fileContents = {
  'first_msg.md': readCardFile('first_msg.md'),
  'system_prompt.md': readCardFile('system_prompt.md'),
  'roleplay_rules.md': readCardFile('roleplay_rules.md'),
  'plot/chapter-1.md': readCardFile('plot/chapter-1.md'),
  'plot/chapter-2.md': readCardFile('plot/chapter-2.md'),
  'state/schema.json': JSON.stringify(stateSchema),
  'state/llm_schema.md': readCardFile('state/llm_schema.md'),
  'state/state_update_rules.md': readCardFile('state/state_update_rules.md'),
  'scripts/plot.js': readCardFile('scripts/plot.js'),
  'scripts/chapters/chapter-1.js': readCardFile('scripts/chapters/chapter-1.js'),
  'scripts/chapters/chapter-2.js': readCardFile('scripts/chapters/chapter-2.js'),
  ...libraryFileContents
};

async function runFreePlot(currentTime = '2007.10.25: 08:00 星期四') {
  const state = ensureStateDefaults(loadedCard.state.schema, {
    timeline: { currentTime }
  }).state;
  const init = applyGameCard({ card: loadedCard, phase: 'init', messages: [], state, fileContents });
  return applyGameCardAsync({
    card: loadedCard,
    phase: 'pre_send',
    messages: [...init.messages, { role: 'user', content: '继续' }],
    state: init.state,
    fileContents
  });
}

function latestUserGuide(result) {
  return result.messages.findLast((message) => message.role === 'user').content;
}

describe('white album character weak guide', () => {
  afterEach(() => jest.restoreAllMocks());

  test('injects the Setsuna guide independently from a negative plot mood', async () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);

    const result = await runFreePlot();

    expect(result.state.temp.plotMood).toBe('tragic');
    expect(result.state.temp.characterGuideRoll).toBe(100);
    expect(latestUserGuide(result)).toContain('本轮可以根据用户行动、当前场景和最近剧情');
  });

  test('omits the Setsuna guide independently from a positive plot mood', async () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValue(0);

    const result = await runFreePlot();

    expect(result.state.temp.plotMood).toBe('happy');
    expect(result.state.temp.characterGuideRoll).toBe(1);
    expect(latestUserGuide(result)).not.toContain('本轮可以根据用户行动、当前场景和最近剧情');
  });

  test('injects the Touma guide during FreePlot3', async () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);

    const result = await runFreePlot('2007.10.26: 19:30 星期五');

    expect(result.state.temp.PlotType).toBe('FreePlot3');
    expect(result.state.temp.characterGuideRoll).toBe(100);
    expect(latestUserGuide(result)).toContain('选择是否加入一次关于冬马和纱的自然弱引导');
  });
});
