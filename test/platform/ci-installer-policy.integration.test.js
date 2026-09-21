const { spawnSync, execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, renameSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const yaml = require('js-yaml');

const script = path.resolve(__dirname, '../../scripts/ci-installer-policy.mjs');
const sha = 'a'.repeat(40);
function decide(options, files = []) {
  const source = `import { decideInstaller } from ${JSON.stringify(pathToFileURL(script).href)};
    console.log(decideInstaller(${JSON.stringify(options)}, () => ${JSON.stringify(files)}));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout.trim() === 'true';
}

test.each([
  'package-lock.json', 'package.json', 'src/tauri/Cargo.lock', 'src/tauri/tauri.windows.conf.json',
  'src/tauri/build.rs', 'src/tauri/build/devkit.rs', 'src/tauri/sign-windows.ps1',
  'src/tauri/icons/icon.ico', 'src/tauri/capabilities/default.json', 'vite.config.mjs',
  '.cargo/config.toml', 'rust-toolchain.toml', '.github/workflows/tauri-ci.yml',
  '.github/workflows/tauri-release.yml', 'scripts/ci-installer-policy.mjs',
  'devkit/development.md', 'docs/authoring/devkit.md', 'libs/worldbook-library/index.js'
])('packaging input %s enables installer verification', file => {
  expect(decide({ eventName: 'push', event: { before: sha } }, [file])).toBe(true);
});

test('ordinary application, test and non-bundled documentation changes only run tests', () => {
  expect(decide({ eventName: 'push', event: { before: sha } }, [
    'src/renderer/App.jsx', 'src/tauri/src/main.rs', 'src/web/WebApp.jsx',
    'test/web/browser/ui.js', 'wdio.web.conf.mjs', 'README.md', 'docs/engineering/build_and_test.md'
  ])).toBe(false);
});

test('PR policy uses the PR base, and supports empty changes', () => {
  expect(decide({ eventName: 'pull_request', event: { pull_request: { base: { sha } } } },
    ['src/tauri/Cargo.toml'])).toBe(true);
  expect(decide({ eventName: 'push', event: { before: sha } })).toBe(false);
});

test('manual opt-in and release validation are independent of changed paths', () => {
  expect(decide({ eventName: 'workflow_dispatch', event: {} })).toBe(false);
  expect(decide({ eventName: 'workflow_dispatch', event: {}, force: true })).toBe(true);
  expect(decide({ eventName: 'push', event: {}, skip: true }, ['package.json'])).toBe(false);
});

test.each([{}, { before: '0'.repeat(40) }, { before: '--invalid-ref' }])(
  'unknown comparison history enables packaging: %j', event => {
    expect(decide({ eventName: 'push', event })).toBe(true);
  }
);

test('CLI compares the entire push and detects moved/deleted packaging inputs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wcs-ci-policy-'));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const commit = () => {
    git(['add', '.']);
    git(['-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'fixture']);
    return git(['rev-parse', 'HEAD']);
  };
  try {
    git(['init', '-q']);
    mkdirSync(path.join(root, '.git/empty-hooks'));
    git(['config', 'core.hooksPath', path.join(root, '.git/empty-hooks')]);
    git(['config', 'commit.gpgsign', 'false']);
    writeFileSync(path.join(root, 'package.json'), '{}');
    const base = commit();
    writeFileSync(path.join(root, 'app.js'), 'one');
    commit();
    const eventPath = path.join(root, '.git/event.json');
    const outputPath = path.join(root, '.git/output');
    const run = before => {
      writeFileSync(eventPath, JSON.stringify({ before }));
      writeFileSync(outputPath, '');
      const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: {
        ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath,
        SKIP_INSTALLER_CHECK: 'false', BUILD_INSTALLERS: 'false'
      } });
      expect(result.status).toBe(0);
      return readFileSync(outputPath, 'utf8').trim();
    };
    expect(run(base)).toBe('required=false');
    mkdirSync(path.join(root, 'test'));
    renameSync(path.join(root, 'package.json'), path.join(root, 'test/fixture.json'));
    commit();
    expect(run(base)).toBe('required=true');
    // A missing comparison commit and no fetchable origin must fail safe.
    expect(run(sha)).toBe('required=true');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workflow keeps every test and only gates installer build/upload', () => {
  const load = file => yaml.load(readFileSync(path.resolve(__dirname, '../../.github/workflows', file), 'utf8'));
  const ci = load('tauri-ci.yml'), release = load('tauri-release.yml');
  expect(release.jobs.validate.with.skip_installer_check).toBe(true);
  expect(release.jobs.publish.needs).toBe('validate');
  expect(ci.jobs.desktop.needs).toBe('packaging');
  expect(ci.jobs.desktop.if).toBeUndefined();
  const steps = ci.jobs.desktop.steps;
  expect(steps.find(step => step.name === 'Build desktop installer').if).toBe("needs.packaging.outputs.required == 'true'");
  expect(steps.find(step => step.with?.name === 'world-card-station-${{ runner.os }}').if)
    .toBe("needs.packaging.outputs.required == 'true'");
  expect(steps.find(step => step.run === 'npm run test:tauri').if).toBe("runner.os != 'Linux'");
  expect(steps.find(step => step.name === 'Tauri E2E on Linux').if).toBe("runner.os == 'Linux'");
  expect(ci.jobs.web.strategy.matrix.include.map(item => item.browser)).toEqual(['chrome', 'firefox', 'safari']);
});
