const fs = require('fs');
const path = require('path');
const { checkReleaseVersion } = require('../../scripts/check-release-version.cjs');

const root = path.join(__dirname, '../..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const readText = relative => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Tauri desktop release configuration', () => {
  test('keeps release versions synchronized and rejects unrelated tags', () => {
    const version = readJson('package.json').version;
    expect(checkReleaseVersion(root, `refs/tags/app-v${version}`)).toBe(version);
    expect(() => checkReleaseVersion(root, `refs/tags/v${version}`)).toThrow('Release tag');
    expect(checkReleaseVersion(root, 'refs/heads/master')).toBe(version);
    expect(() => checkReleaseVersion(root, 'refs/tags/app-v0.0.0')).toThrow('Release tag');
    const original = fs.readFileSync;
    jest.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => {
      if (file === path.join(root, 'src/tauri/tauri.conf.json')) return '{"version":"0.0.0"}';
      return original(file, ...args);
    });
    try {
      expect(() => checkReleaseVersion(root)).toThrow('versions do not match');
    } finally {
      fs.readFileSync.mockRestore();
    }
  });

  test('gates draft stable releases on the reusable full CI workflow', () => {
    const ci = readText('.github/workflows/tauri-ci.yml');
    const release = readText('.github/workflows/tauri-release.yml');
    expect(ci).toContain('branches: [master, main]');
    expect(ci).toContain('workflow_call:');
    expect(ci).toContain('workflow_dispatch:');
    expect(ci).toContain('run: npx wdio run wdio.tavern.conf.mjs');
    expect(ci).toContain('run: dbus-run-session -- xvfb-run -a npx wdio run wdio.tavern.conf.mjs');
    expect(ci).toContain('webkit2gtk-driver');
    expect(ci).toContain("WEBKIT_DISABLE_COMPOSITING_MODE: '1'");
    expect(release).toContain('uses: ./.github/workflows/tauri-ci.yml');
    expect(release).toContain('needs: validate');
    expect(release).toContain('node scripts/check-release-version.cjs');
    expect(release).toContain('releaseDraft: true');
    expect(release).toContain('prerelease: false');
    expect(release).toContain('tagName: app-v__VERSION__');
  });

  test('keeps WebdriverIO permissions out of production builds', () => {
    const base = readJson('src/tauri/tauri.conf.json');
    const e2e = readJson('src/tauri/tauri.e2e.conf.json');
    const capability = readJson('src/tauri/capabilities/default.json');

    expect(base.app.security.capabilities).toEqual(['default']);
    expect(e2e.app.security.capabilities[0].identifier).toBe('e2e');
    expect(e2e.app.security.capabilities[0].permissions).toContain('wdio:default');
    expect(e2e.app.security.capabilities[0].permissions).toContain('core:window:allow-set-focus');
    expect(capability.permissions).toEqual([
      'core:default',
      'core:window:allow-destroy',
      'core:window:allow-set-fullscreen'
    ]);
  });

  test('builds the intended installer types on every desktop platform', () => {
    const macos = readJson('src/tauri/tauri.macos.conf.json');
    const windows = readJson('src/tauri/tauri.windows.conf.json');
    const linux = readJson('src/tauri/tauri.linux.conf.json');

    expect(macos.bundle.targets).toEqual(['app', 'dmg']);
    expect(windows.bundle.targets).toEqual(['nsis']);
    expect(linux.bundle.targets).toEqual(['deb', 'appimage']);
    expect(linux.bundle.linux.appimage.bundleMediaFramework).toBe(true);
  });

  test('runs Tauri E2E and bundles on the three-platform CI matrix', () => {
    const workflow = readText('.github/workflows/tauri-ci.yml');

    expect(workflow).toContain('name: World Card Station desktop CI');
    expect(workflow).toContain('name: world-card-station-${{ runner.os }}');
    expect(workflow).toContain('[macos-latest, ubuntu-22.04, windows-latest]');
    expect(workflow).toContain('npm run test:tauri');
    expect(workflow).toContain('npm run tauri:build');
  });

  test('publishes releases under the World Card Station brand', () => {
    const workflow = readText('.github/workflows/tauri-release.yml');

    expect(workflow).toContain('name: World Card Station desktop release');
    expect(workflow).toContain('releaseName: World Card Station v__VERSION__');
    expect(workflow).toContain('World Card Station (世界站) installers');
  });

  test('retains the controlled resource CSP in release builds', () => {
    const csp = readJson('src/tauri/tauri.conf.json').app.security.csp;

    expect(csp['img-src']).toContain('local:');
    expect(csp['media-src']).toContain('local:');
    expect(csp['object-src']).toBe("'none'");
    expect(csp['connect-src']).not.toMatch(/https?:\/\/\*/);
  });
});
