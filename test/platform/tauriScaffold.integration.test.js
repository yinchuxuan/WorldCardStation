const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

describe('Tauri desktop scaffold', () => {
  test('keeps all source roots under src', () => {
    const sourceRoots = fs.readdirSync(path.join(rootDir, 'src'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();

    expect(sourceRoots).toEqual(['renderer', 'shared', 'tauri', 'web']);
  });

  test('uses the shared Vite renderer and existing window dimensions', () => {
    const config = readJson('src/tauri/tauri.conf.json');

    expect(config.productName).toBe('World Card Station');
    expect(config.identifier).toBe('com.airp.chatapp');
    expect(config.build).toEqual({
      beforeDevCommand: 'npm --prefix .. run renderer:dev',
      devUrl: 'http://localhost:1420',
      beforeBuildCommand: 'npm --prefix .. run renderer:build',
      frontendDist: '../../dist/renderer'
    });
    expect(config.app.windows).toEqual([
      expect.objectContaining({
        label: 'main', title: '世界站 · World Card Station', width: 1200, height: 800
      })
    ]);
  });

  test('grants only required production permissions to the main window', () => {
    const capability = readJson('src/tauri/capabilities/default.json');

    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual([
      'core:default',
      'core:window:allow-destroy',
      'core:window:allow-set-fullscreen'
    ]);
  });

  test('declares scripts and desktop icons used by the bundle', () => {
    const packageJson = readJson('package.json');
    const config = readJson('src/tauri/tauri.conf.json');

    expect(packageJson.name).toBe('world-card-station');
    expect(packageJson.productName).toBe('World Card Station');
    expect(packageJson.scripts).toEqual(expect.objectContaining({
      dev: 'cd src/tauri && tauri dev',
      build: 'cd src/tauri && tauri build',
      'renderer:build': 'vite build --config vite.config.mjs',
      'renderer:dev': 'vite --config vite.config.mjs',
      'game-card:export': expect.stringContaining('--bin game-card-export'),
      'tauri:dev': 'npm run dev',
      'tauri:build': 'npm run build'
    }));
    expect(packageJson).not.toHaveProperty('main');
    expect(packageJson.devDependencies).not.toHaveProperty('electron');
    expect(packageJson.devDependencies).not.toHaveProperty('playwright');
    expect(packageJson.devDependencies).not.toHaveProperty('@playwright/test');
    config.bundle.icon.forEach(iconPath => {
      expect(fs.existsSync(path.join(rootDir, 'src/tauri', iconPath))).toBe(true);
    });
  });

  test('registers the repository and file picker without legacy write or folder commands', () => {
    const cargo = fs.readFileSync(path.join(rootDir, 'src/tauri/Cargo.toml'), 'utf8');
    const lib = fs.readFileSync(path.join(rootDir, 'src/tauri/src/lib.rs'), 'utf8');
    const schema = fs.readFileSync(path.join(rootDir, 'src/tauri/src/game_card_schema.rs'), 'utf8');

    expect(cargo).toContain('tauri-plugin-dialog = "2"');
    expect(cargo).toContain('default-run = "world-card-station-tauri"');
    expect(lib).toContain('.plugin(tauri_plugin_dialog::init())');
    [
      'get_game_cards',
      'get_game_card',
      'import_game_card_from_file',
      'set_active_game_card',
      'delete_game_card',
      'get_active_game_card',
      'read_game_card_file'
    ].forEach(command => expect(lib).toContain(`game_card_commands::${command}`));
    expect(lib).not.toContain('game_card_commands::save_game_card');
    expect(lib).not.toContain('game_card_commands::import_game_card_from_directory');
    expect(lib).toMatch(/#\[cfg\(feature = "e2e"\)\]\s+game_card_commands::e2e_seed_game_card/);
    const commands = fs.readFileSync(path.join(rootDir, 'src/tauri/src/game_card_commands.rs'), 'utf8');
    expect(commands).toMatch(/#\[cfg\(feature = "e2e"\)\]\s+#\[tauri::command\]\s+pub async fn e2e_seed_game_card/);
    expect(lib).toContain('config_commands::select_background_image');
    expect(lib).toContain('register_asynchronous_uri_scheme_protocol("local"');
    expect(schema).toContain('include_str!("../../shared/game-card/schema/game-card.schema.json")');
  });
});
