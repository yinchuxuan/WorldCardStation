import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Packaging inputs, not ordinary application code or test changes.
const packagingPaths = [
  /^(package(?:-lock)?\.json|\.npmrc|Cargo\.(toml|lock)|rust-toolchain(?:\.toml)?)$/,
  /^\.cargo\//,
  /^vite\..*\.(mjs|js|ts)$/,
  /^\.github\/workflows\/tauri-(ci|release)\.yml$/,
  /^scripts\//,
  /^src\/tauri\/(?!src\/|tests\/)/,
  /^(public|assets|devkit|libs)\//,
  /^src\/renderer\/(assets\/|index\.html$)/,
  /^docs\/(game_card|authoring|compatibility)\//
];

export function requiresInstaller(paths) {
  return paths.some(file => packagingPaths.some(pattern => pattern.test(file)));
}

export function decideInstaller({ eventName, event, skip, force }, changedFiles) {
  if (skip) return false;
  if (force) return true;
  if (eventName === 'workflow_dispatch') return false;
  const base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
  // New branches, missing history or unknown events must not silently skip validation.
  if (!/^[0-9a-f]{40}$/.test(base || '') || /^0+$/.test(base)) return true;
  return requiresInstaller(changedFiles(base));
}

function changedFiles(base) {
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['cat-file', '-e', `${base}^{commit}`]);
  } catch {
    git(['fetch', '--no-tags', '--depth=1', 'origin', base]);
  }
  // PR checkout is the merge commit; comparing its base keeps unrelated base changes out.
  // Disable rename detection so moving a packaging input away still triggers a build.
  return git(['diff', '--name-only', '--no-renames', '-z', base, 'HEAD']).split('\0').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let required;
  try {
    required = decideInstaller({
      eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      skip: process.env.SKIP_INSTALLER_CHECK === 'true',
      force: process.env.BUILD_INSTALLERS === 'true'
    }, changedFiles);
  } catch (error) {
    console.warn(`Cannot determine changed packaging inputs; building installers: ${error.message}`);
    required = true;
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\n`);
  console.log(`Desktop installer verification: ${required ? 'required' : 'skipped; all tests still run'}`);
}
