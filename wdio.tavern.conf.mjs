import { config as base } from './wdio.tauri.conf.mjs';
import path from 'node:path';

const importFile = path.resolve('test-results/tauri-e2e/tavern.json');
export const config = {
  ...base,
  specs: ['./test/tauri-e2e/tavern-import.e2e.js'],
  exclude: [],
  services: base.services.map(([name, options]) => [name, {
    ...options, env: { ...options.env, WORLD_CARD_STATION_E2E_IMPORT_FILE: importFile }
  }])
};
