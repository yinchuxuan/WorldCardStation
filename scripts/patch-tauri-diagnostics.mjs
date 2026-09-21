import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Compatibility fix for @wdio/tauri-service 1.2.0: its launcher diagnoses an
// external tauri-driver even when the actual session uses the embedded server.
// Keep all other diagnostics and the external-driver error path unchanged.
const replacements = [
  [
    'async function diagnoseDriver(options) {\n    const results = [];',
    "async function diagnoseDriver(options) {\n    if (options.driverProvider === 'embedded') return [];\n    const results = [];"
  ],
  [
    'const results = await diagnoseTauriEnvironment(binaryPath, {\n            autoInstallTauriDriver:',
    "const results = await diagnoseTauriEnvironment(binaryPath, {\n            driverProvider: this.isEmbeddedMode ? 'embedded' : this.options.driverProvider,\n            autoInstallTauriDriver:"
  ]
];

export function patchDiagnostics(source) {
  return applyReplacements(source, replacements);
}

export function patchBinaryPermissions(source) {
  const before = `        results.push({
            category: 'Binary Permissions',
            status: isExecutable ? 'ok' : 'error',
            message: mode,
            details: isExecutable ? 'Binary is executable' : 'Binary is not executable. Run chmod +x on Unix systems.',
        });`;
  // Windows file modes do not encode executable permission. Actual process
  // launch still reports ACL/OS execution failures; do not claim an ACL check.
  const after = `        if (process.platform !== 'win32') {\n${before}\n        }`;
  return applyReplacements(source, [[before, after]]);
}

function applyReplacements(source, changes) {
  for (const [before, after] of changes) {
    if (source.includes(after)) continue;
    if (source.split(before).length !== 2) {
      throw new Error('Tauri diagnostics source changed; review or remove the compatibility patch.');
    }
    source = source.replace(before, after);
  }
  return source;
}

export function installPatch() {
  const packages = [
    { name: 'tauri-service', expected: '1.2.0', patch: patchDiagnostics },
    { name: 'native-utils', expected: '2.5.0', patch: patchBinaryPermissions }
  ];
  const files = packages.flatMap(({ name, expected, patch }) => {
    const packageRoot = new URL(`../node_modules/@wdio/${name}/`, import.meta.url);
    const manifest = new URL('package.json', packageRoot);
    if (!existsSync(manifest)) return []; // Production-only installs omit dev dependencies.
    const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
    if (version !== expected) throw new Error(`Review Tauri diagnostics patch for ${name} ${version}.`);
    return ['esm', 'cjs'].map(format => {
      const file = new URL(`dist/${format}/index.js`, packageRoot);
      const source = readFileSync(file, 'utf8');
      return { file, source, patched: patch(source) };
    });
  });
  for (const { file, source, patched } of files) {
    if (source !== patched) writeFileSync(file, patched);
  }
  console.log('Tauri diagnostics: embedded provider and Windows permission compatibility patches applied.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  installPatch();
}
