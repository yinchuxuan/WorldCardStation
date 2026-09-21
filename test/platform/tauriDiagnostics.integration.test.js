const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('installed ESM/CJS diagnostics honor embedded mode without hiding external failures', () => {
  const patchUrl = pathToFileURL(path.resolve(__dirname, '../../scripts/patch-tauri-diagnostics.mjs')).href;
  const source = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import vm from 'node:vm';
    import { patchDiagnostics } from ${JSON.stringify(patchUrl)};
    for (const format of ['esm', 'cjs']) {
      const source = readFileSync('node_modules/@wdio/tauri-service/dist/' + format + '/index.js', 'utf8');
      assert.equal(patchDiagnostics(source), source, 'npm postinstall must patch both entry points');
      assert.equal(patchDiagnostics(patchDiagnostics(source)), source, 'patch must be idempotent');
      const start = source.indexOf('async function diagnoseDriver(options)');
      const end = source.indexOf('async function diagnoseWebKit()', start);
      let calls = 0;
      const driver = vm.runInNewContext(source.slice(start, end) + '; diagnoseDriver', {
        ensureTauriDriver: async () => {
          calls++;
          return { error: new Error('external driver is missing') };
        },
        isErr: result => Boolean(result.error),
        nativeUtils: { isErr: result => Boolean(result.error) }
      });
      assert.equal((await driver({ driverProvider: 'embedded' })).length, 0);
      assert.equal(calls, 0, 'embedded diagnostics must not look up or install an external driver');
      const external = await driver({ driverProvider: 'external' });
      assert.equal(calls, 1);
      assert.equal(external[0].status, 'error');
      assert.equal(external[0].message, 'external driver is missing');
      const body = source.match(/async diagnoseEnvironment\\(binaryPath\\) \\{([\\s\\S]*?)\\n    \\}/)[1];
      let received;
      const formatDiagnosticResults = () => {};
      const launcher = vm.runInNewContext('(async function(binaryPath) {' + body + '})', {
        diagnoseTauriEnvironment: async (_binary, options) => { received = options; return []; },
        formatDiagnosticResults, nativeUtils: { formatDiagnosticResults }
      });
      await launcher.call({ isEmbeddedMode: true, options: {} }, 'app');
      assert.equal(received.driverProvider, 'embedded');
      await launcher.call({ isEmbeddedMode: false, options: { driverProvider: 'external' } }, 'app');
      assert.equal(received.driverProvider, 'external');
      for (const check of ['diagnosePlatform', 'diagnoseDisplay', 'diagnoseBinary', 'diagnoseLinuxDependencies', 'diagnoseDiskSpace']) {
        assert(source.includes(check + '('), check + ' must remain enabled');
      }
    }
    assert.throws(() => patchDiagnostics('unexpected upstream source'), /source changed/);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8'
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
