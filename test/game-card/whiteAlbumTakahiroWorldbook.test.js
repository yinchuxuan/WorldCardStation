const fs = require('node:fs');
const path = require('node:path');
const { card } = require('./whiteAlbumTestCard');

const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const readCardFile = relativePath => fs.readFileSync(path.join(cardDir, relativePath), 'utf-8');

describe('white album Takahiro worldbook', () => {
  test('documents Takahiro in a separate entry and the index', () => {
    const entry = readCardFile('worldbook/entries/小木曾孝宏.md');
    const index = readCardFile('worldbook/entries/世界书索引.md');

    expect(entry).toContain('小木曾孝宏:');
    expect(entry).toContain('小木曾雪菜的弟弟');
    expect(entry).toContain('直接邀请对方一起玩或留下吃饭');
    expect(index).toContain('- 小木曾孝宏: 雪菜的弟弟，会当着客人的面拆姐姐的台');
  });

  test('registers Takahiro keywords in config for the shared loader', () => {
    const config = JSON.parse(readCardFile('worldbook/config.json'));
    const entry = config.entries.find((item) => item.name === '小木曾孝宏');
    const rule = card.rules.find((item) => item.id === 'wa2-insert-turn-context');

    expect(entry.keys).toEqual(['孝宏', '小木曾孝宏', '小木曽孝宏', 'Takahiro']);
    expect(entry.extensions.world_card_station.content_file).toBe('entries/小木曾孝宏.md');
    expect(rule.then[0]).toEqual({
      type: 'exec', sourceFile: 'lib/worldbook/index.js', args: { worldbook: 'worldbook' }
    });
  });
});
