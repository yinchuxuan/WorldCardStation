const fs = require('node:fs');
const path = require('node:path');
const { stateSchema } = require('./whiteAlbumTestCard');

const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(cardDir, relativePath), 'utf8'));
const readText = relativePath => fs.readFileSync(path.join(cardDir, relativePath), 'utf8');

describe('white album 2 event removal', () => {
  test('does not declare event resources, scripts, state, or UI', () => {
    const files = readJson('files.json');
    const ui = readJson('ui.json');
    const source = [
      readText('scripts/chapters/chapter-2.js'),
      readText('ui/root.js'),
      readText('ui/root.css')
    ].join('\n');

    expect(Object.keys(files).some(key => key.startsWith('event.'))).toBe(false);
    expect(ui.scripts).toBeUndefined();
    expect(Object.keys(stateSchema.schema).some(key => key.startsWith('events.'))).toBe(false);
    expect(stateSchema.schema['visual.scene'].values).not.toContain('event1');
    expect(source).not.toMatch(/eventControl|wa2-event|state\.events/);
    expect(fs.existsSync(path.join(cardDir, 'ui/event-controller.js'))).toBe(false);
    expect(fs.existsSync(path.join(cardDir, 'events/chapter2-after-fixedplot1-rehearsal-memory.md')))
      .toBe(false);
  });
});
