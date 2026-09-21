const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Windows omits Unix mode diagnostics while Unix and missing-binary errors remain', () => {
  const patchUrl = pathToFileURL(path.resolve(__dirname, '../../scripts/patch-tauri-diagnostics.mjs')).href;
  const source = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import vm from 'node:vm';
    import { patchBinaryPermissions } from ${JSON.stringify(patchUrl)};
    for (const format of ['esm', 'cjs']) {
      const source = readFileSync('node_modules/@wdio/native-utils/dist/' + format + '/index.js', 'utf8');
      assert.equal(patchBinaryPermissions(source), source, 'installed entry point must be patched');
      const start = source.indexOf('function diagnoseBinary(binaryPath)');
      const end = source.indexOf('function diagnoseSharedLibraries(binaryPath)', start);
      const body = source.slice(start, end);
      for (const platform of ['win32', 'linux', 'darwin']) {
        for (const mode of [0o666, 0o755]) {
          let missing = false;
          let libraryChecks = 0;
          const statSync = () => {
            if (missing) throw new Error('binary missing');
            return { mode, size: 1024 };
          };
          const diagnose = vm.runInNewContext(body + '; diagnoseBinary', {
            statSync, node_fs: { statSync }, process: { platform },
            diagnoseSharedLibraries: () => { libraryChecks++; return []; }
          });
          const results = diagnose('app');
          const permission = results.find(row => row.category === 'Binary Permissions');
          if (platform === 'win32') {
            assert.equal(permission, undefined);
            assert(!JSON.stringify(results).includes('chmod'));
          } else {
            assert.equal(permission.status, mode === 0o755 ? 'ok' : 'error');
          }
          assert(results.some(row => row.category === 'Binary Size'));
          assert.equal(libraryChecks, platform === 'linux' ? 1 : 0);
          missing = true;
          const errors = diagnose('missing');
          assert.equal(errors[0].category, 'Binary');
          assert.equal(errors[0].status, 'error');
          assert(errors[0].message.includes('Failed to stat binary'));
        }
      }
    }
    assert.throws(() => patchBinaryPermissions('unexpected upstream source'), /source changed/);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8'
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});

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
