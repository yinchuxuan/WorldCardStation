// Repository publishing helper: reuse the runtime include parser without executing card code.
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { resolveExecSource } from '../src/renderer/gameCard/execSource.js';
import { loadMainModules } from '../src/shared/game-card/runtime/mainModules.js';

const { root, scripts, main } = JSON.parse(readFileSync(0, 'utf8'));
// Rust canonicalization returns namespaced Windows paths (\\?\...).
// The native resolver handles these without walking the bare drive as a file.
const base = realpathSync.native(root);
const paths = new Set();
function readFile(relative) {
  if (relative.split('/').some(part => !part || part === '.' || part === '..')
      || /[\\:%?#\x00-\x1f]/.test(relative) || relative.startsWith('/')) {
    throw new Error(`Unsafe script dependency: ${relative}`);
  }
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic link: ${relative}`);
  }
  paths.add(relative);
  return readFileSync(current, 'utf8');
}
for (const sourceFile of scripts) resolveExecSource({ sourceFile }, { readFile });
if (main) await loadMainModules({ main: { path: main, source: readFile(main) }, readText: readFile });
process.stdout.write(JSON.stringify([...paths].sort()));
