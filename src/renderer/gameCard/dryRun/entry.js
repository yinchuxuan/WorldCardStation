import { checkCard } from './checkCard.js';

async function start() {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  try {
    const card = await invoke('dry_run_card');
    const result = await checkCard(card, file => invoke('dry_run_read', { file }));
    await invoke('dry_run_finish', { result });
  } catch (error) {
    await invoke('dry_run_finish', { result: { failure: error.message || String(error) } });
  }
}

start();
