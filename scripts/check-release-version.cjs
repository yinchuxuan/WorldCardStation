const fs = require('node:fs');
const path = require('node:path');

function checkReleaseVersion(root, ref = '') {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const version = JSON.parse(read('package.json')).version;
  const lock = JSON.parse(read('package-lock.json'));
  const cargoVersion = read('src/tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1];
  const versions = [lock.version, lock.packages[''].version, cargoVersion,
    JSON.parse(read('src/tauri/tauri.conf.json')).version];
  if (versions.some(value => value !== version)) throw new Error('Release versions do not match');
  if (ref.startsWith('refs/tags/') && ![`refs/tags/v${version}`, `refs/tags/app-v${version}`].includes(ref)) {
    throw new Error(`Release tag must be v${version} or app-v${version}`);
  }
  return version;
}

if (require.main === module) {
  console.log(checkReleaseVersion(path.join(__dirname, '..'), process.env.GITHUB_REF));
}

module.exports = { checkReleaseVersion };
