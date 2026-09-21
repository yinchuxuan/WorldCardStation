const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('test-only card seeding is feature-gated at definition and command registration', () => {
  const lib = read('src/tauri/src/lib.rs');
  const commands = read('src/tauri/src/game_card_commands.rs');
  expect(lib).toMatch(/#\[cfg\(feature = "e2e"\)\]\s+game_card_commands::e2e_seed_game_card/);
  expect(commands).toMatch(/#\[cfg\(feature = "e2e"\)\]\s+#\[tauri::command\]\s+pub async fn e2e_seed_game_card/);
});

test('native card validation embeds the same schema as JavaScript', () => {
  expect(read('src/tauri/src/game_card_schema.rs'))
    .toContain('include_str!("../../shared/game-card/schema/game-card.schema.json")');
});
