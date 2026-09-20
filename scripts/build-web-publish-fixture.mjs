import { mkdtemp, cp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Run the real publisher; do not substitute a hand-authored browser catalog.
const temporary = await mkdtemp(path.join(tmpdir(), 'wcs-web-publish-'));
const source = path.join(temporary, 'source');
const output = path.resolve('dist/web-fixture/cards');
try {
  await cp('test/web/fixtures/publish-card', source, { recursive: true });
  await mkdir(path.join(source, 'images'));
  await mkdir(path.join(source, 'audio'));
  const wav = Buffer.alloc(8044, 128);
  Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', 'base64').copy(wav);
  wav.writeUInt32LE(8036, 4); wav.writeUInt32LE(8000, 40);
  await writeFile(path.join(source, 'audio/tone.wav'), wav);
  await copyFile('src/tauri/icons/32x32.png', path.join(source, 'images/cover.png'));
  await copyFile('src/tauri/icons/32x32.png', path.join(source, 'images/outside.png'));
  const args = ['run', '--quiet', '--manifest-path', 'src/tauri/Cargo.toml', '--bin', 'game-card-publish',
    '--', source, '--output', output, '--cover', 'images/cover.png'];
  const manifest = JSON.parse(execFileSync('cargo', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
  const index = JSON.parse(await readFile(path.join(output, 'index.json'), 'utf8'));
  assert.equal(index.cards[0].releaseId, manifest.releaseId);
  const root = path.join(output, manifest.cardId, manifest.releaseId);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8')), manifest);
  for (const file of [...manifest.files, manifest.cover]) {
    const bytes = await readFile(path.join(root, file.path));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  const before = await readFile(path.join(output, 'index.json'));
  const contentHash = createHash('sha256').update('wcs-content-v1\0');
  const u64 = value => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); return bytes; };
  for (const file of manifest.files) {
    contentHash.update(u64(Buffer.byteLength(file.path))).update(file.path)
      .update(u64(file.bytes)).update(file.sha256);
  }
  assert.equal(manifest.contentFingerprint, `wcs-content-v1-${contentHash.digest('hex')}`);
  assert.equal(JSON.parse(execFileSync('cargo', args, { encoding: 'utf8' })).releaseId, manifest.releaseId);
  assert.deepEqual(await readFile(path.join(output, 'index.json')), before);
  const card = JSON.parse(await readFile(path.join(source, 'card.json'), 'utf8'));
  await writeFile(path.join(source, 'card.json'), JSON.stringify({ ...card, version: '2.0' }));
  execFileSync('cargo', args, { encoding: 'utf8' });
  const secondIndex = JSON.parse(await readFile(path.join(output, 'index.json'), 'utf8'));
  await writeFile(path.resolve('dist/web-fixture/versions.json'), JSON.stringify([index.cards[0], secondIndex.cards[0]]));
  await writeFile(path.join(output, 'index.json'), before);
  // A separate catalog tests reading checkpoints without changing the normal fixture's semantics.
  await writeFile(path.join(source, 'card.json'), JSON.stringify({ ...card, display: { segmentedReading: true } }));
  const readingArgs = [...args];
  readingArgs[readingArgs.indexOf('--output') + 1] = path.resolve('dist/web-reading-fixture/cards');
  execFileSync('cargo', readingArgs, { encoding: 'utf8' });
  console.log('Real Rust publisher round-trip, checksums and immutable repeat passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
