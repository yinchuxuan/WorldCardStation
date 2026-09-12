const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');
const read = relativePath => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('Tauri WebView compatibility policy', () => {
  test('permits only the runtime features used by game cards', () => {
    const config = JSON.parse(read('src/tauri/tauri.conf.json'));
    const csp = config.app.security.csp;

    expect(csp['script-src']).toContain("'unsafe-eval'");
    expect(csp['worker-src']).toContain('blob:');
    expect(csp['style-src']).toContain("'unsafe-inline'");
    expect(csp['img-src']).toContain('local:');
    expect(csp['media-src']).toContain('http://local.localhost');
    expect(csp['connect-src']).toBe("'self' ipc: http://ipc.localhost");
    expect(csp['object-src']).toBe("'none'");
  });

  test('uses native streaming with only the required window permissions', () => {
    const cargo = read('src/tauri/Cargo.toml');
    const lib = read('src/tauri/src/lib.rs');
    const capability = JSON.parse(read('src/tauri/capabilities/default.json'));

    expect(cargo).toContain('reqwest =');
    expect(lib).toContain('model_commands::stream_model_request');
    expect(lib).toContain('model_commands::cancel_model_stream');
    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual([
      'core:default',
      'core:window:allow-destroy', // Close only after the renderer has flushed session data.
      'core:window:allow-set-fullscreen'
    ]);
  });

  test('bundles platform fonts without remote static resources', () => {
    const html = read('src/renderer/index.html');
    const styles = read('src/renderer/styles/renderer.css');
    const packageJson = JSON.parse(read('package.json'));

    expect(html).not.toMatch(/https?:\/\//);
    expect(styles).toContain("@fontsource/roboto/latin-400.css");
    expect(styles).toContain("@fontsource/roboto-mono/latin-400.css");
    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      '@fontsource/roboto': expect.any(String),
      '@fontsource/roboto-mono': expect.any(String)
    }));
  });
});
