const fs = require('node:fs');
const path = require('node:path');
const { card } = require('./whiteAlbumTestCard');

const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const readCardFile = (relativePath) => fs.readFileSync(path.join(cardDir, relativePath), 'utf-8');

describe('white album Chikashi worldbook', () => {
  test('documents Chikashi in a separate entry and the index', () => {
    const entry = readCardFile('worldbook/entries/早坂亲志.md');
    const index = readCardFile('worldbook/entries/世界书索引.md');

    expect(entry).toContain('早坂亲志:');
    expect(entry).toContain('三年E班学生，春希的同班同学');
    expect(entry).toContain('实际经常把麻烦和工作托付给认真负责的春希');
    expect(index).toContain('- 早坂亲志: 春希的三年E班同学');
  });

  test('registers Chikashi keywords in config for the shared loader', () => {
    const config = JSON.parse(readCardFile('worldbook/config.json'));
    const entry = config.entries.find((item) => item.name === '早坂亲志');
    const rule = card.rules.find((item) => item.id === 'wa2-insert-turn-context');

    expect(entry.keys).toEqual(['亲志', '親志', '早坂', 'Hayasaka', 'Chikashi']);
    expect(entry.extensions.world_card_station.content_file).toBe('entries/早坂亲志.md');
    expect(rule.then[0]).toEqual({
      type: 'exec', sourceFile: 'lib/worldbook/index.js', args: { worldbook: 'worldbook' }
    });
  });
});
