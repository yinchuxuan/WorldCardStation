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
  for (const [before, after] of replacements) {
    if (source.includes(after)) continue;
    if (source.split(before).length !== 2) {
      throw new Error('Tauri diagnostics source changed; review or remove the compatibility patch.');
    }
    source = source.replace(before, after);
  }
  return source;
}

export function installPatch() {
  const packageRoot = new URL('../node_modules/@wdio/tauri-service/', import.meta.url);
  const manifest = new URL('package.json', packageRoot);
  if (!existsSync(manifest)) return; // Production-only installs omit this dev dependency.
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
  if (version !== '1.2.0') throw new Error(`Review Tauri diagnostics patch for service ${version}.`);
  const files = ['esm', 'cjs'].map(format => {
    const file = new URL(`dist/${format}/index.js`, packageRoot);
    const source = readFileSync(file, 'utf8');
    return { file, source, patched: patchDiagnostics(source) };
  });
  for (const { file, source, patched } of files) {
    if (source !== patched) writeFileSync(file, patched);
  }
  console.log('Tauri diagnostics: embedded provider compatibility patch applied.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  installPatch();
}
