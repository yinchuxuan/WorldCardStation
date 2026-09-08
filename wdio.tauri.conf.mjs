import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.join(root, 'test-results', 'tauri-e2e');
const dataDir = path.join(runtimeDir, 'data');
const importDir = path.join(runtimeDir, 'card');
const backgroundPath = path.join(root, 'test', 'fixtures', 'lisa1.jpg');
const binaryName = process.platform === 'win32'
  ? 'world-card-station-tauri.exe' : 'world-card-station-tauri';
const binaryPath = path.join(root, 'src', 'tauri', 'target', 'debug', binaryName);

function silentWav() {
  const bytes = Buffer.alloc(45);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(37, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28);
  bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write('data', 36);
  bytes.writeUInt32LE(1, 40); bytes[44] = 128;
  return bytes;
}

function prepareRuntime() {
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.cpSync(path.join(root, 'test', 'tauri-e2e', 'fixture-card'), importDir, { recursive: true });
  fs.mkdirSync(path.join(importDir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(importDir, 'audio'), { recursive: true });
  fs.copyFileSync(path.join(root, 'test', 'fixtures', 'lisa1.jpg'), path.join(importDir, 'images', 'scene.jpg'));
  fs.writeFileSync(path.join(importDir, 'audio', 'silence.wav'), silentWav());
}

export const config = {
  runner: 'local',
  specs: ['./test/tauri-e2e/**/*.e2e.js'],
  exclude: ['./test/tauri-e2e/tavern-import.e2e.js'],
  maxInstances: 1,
  services: [['@wdio/tauri-service', {
    appBinaryPath: binaryPath,
    driverProvider: 'embedded',
    captureBackendLogs: true,
    captureFrontendLogs: false,
    clearMocks: false,
    resetMocks: false,
    restoreMocks: false,
    startTimeout: 30000,
    env: {
      WORLD_CARD_STATION_E2E_DATA_DIR: dataDir,
      WORLD_CARD_STATION_E2E_IMPORT_DIR: importDir,
      WORLD_CARD_STATION_E2E_BACKGROUND_PATH: backgroundPath
    }
  }]],
  capabilities: [{ browserName: 'tauri' }],
  logLevel: 'warn',
  waitforTimeout: 15000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 2,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 60000 },
  onPrepare: prepareRuntime
};
