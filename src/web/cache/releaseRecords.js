import { createWebStore } from '../storage.js';
export function createReleaseRecords(indexedDB = globalThis.indexedDB, name = 'WorldCardStationWeb') {
  return createWebStore('cardReferences', indexedDB, name);
}
