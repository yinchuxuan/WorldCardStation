const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('publishing resolves script includes from native canonical paths', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wcs-publish-path-'));
  try {
    mkdirSync(path.join(root, 'scripts'));
    writeFileSync(path.join(root, 'scripts/main.js'), "include('./shared.js');\nthrow new Error('must not execute');");
    writeFileSync(path.join(root, 'scripts/shared.js'), 'const shared = true;');
    const result = spawnSync(process.execPath, [
      '--experimental-default-type=module',
      path.resolve(__dirname, '../../scripts/publish-script-dependencies.mjs')
    ], { encoding: 'utf8', input: JSON.stringify({
      root: path.toNamespacedPath(root), scripts: ['scripts/main.js']
    }) });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['scripts/main.js', 'scripts/shared.js']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
