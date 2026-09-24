import { capabilities, savePolicy, rendererServices } from '../../../src/renderer/platform/index.js';
import './cacheHarness.js';
import './runtimeHarness.js';
import './sessionHarness.js';
import './resourceLifecycleHarness.js';
import './mainProgramHarness.js';

// A separate browser entry exercises real production module resolution.
const operations = [rendererServices.window.onCloseRequested, rendererServices.trace.start,
  rendererServices.cards.importFile, rendererServices.window.destroy];
const errors = operations.map(operation => {
  try { operation(); return 'unexpected success'; } catch (error) { return error.code; }
});
document.getElementById('result').textContent = JSON.stringify({ capabilities, savePolicy, errors });
