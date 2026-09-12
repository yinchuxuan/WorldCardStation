/* global browser, $ */

const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.resolve('test-results/tauri-e2e/data');

async function invoke(command, args = {}) {
  return browser.execute((name, payload) => (
    window.__TAURI_INTERNALS__.invoke(name, payload)
  ), command, args);
}

async function invokeError(command, args = {}) {
  return browser.execute(async (name, payload) => {
    try {
      await window.__TAURI_INTERNALS__.invoke(name, payload);
      return '';
    } catch (error) {
      if (typeof error === 'string') return error;
      return error?.error || error?.message || JSON.stringify(error);
    }
  }, command, args);
}

async function setInput(content) {
  await browser.execute((value) => {
    const input = document.querySelector('.chat-input-textarea');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype, 'value'
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, content);
}

async function sendMessage(content) {
  await setInput(content);
  await browser.execute(() => document.querySelector('.chat-input-area')?.requestSubmit());
}

async function refreshApp() {
  await browser.refresh();
  await $('.app-container').waitForExist();
}

async function revealHeader() {
  await browser.execute(() => {
    const trigger = document.querySelector('.chat-header-hover-trigger');
    trigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    trigger?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await $('.chat-header-visible').waitForDisplayed();
}

async function toggleHistory() {
  await revealHeader();
  await browser.execute(() => document.querySelector('.chat-header-clickable')?.click());
}

async function saveCard(card, files = {}) {
  await invoke('e2e_seed_game_card', { card });
  if (Object.keys(files).length) {
    await writeCardFiles(card.id, files);
  }
}

async function writeCardFiles(cardId, files) {
  const cardDir = path.join(dataDir, 'game-cards', 'cards', cardId);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(cardDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

async function activateCard(card, files = {}) {
  await saveCard(card, files);
  await invoke('set_active_game_card', { id: card.id });
  await refreshApp();
}

async function deactivateCard() {
  await invoke('set_active_game_card', { id: null });
  await refreshApp();
}

async function saveHistory(messages, options = null) {
  return invoke('save_chat_history', { messages, options });
}

async function getHistory() {
  return invoke('get_chat_history');
}

async function resetNoCard() {
  await invoke('set_active_game_card', { id: null });
  await saveHistory([]);
  await refreshApp();
}

async function waitForHistory(predicate, timeout = 15000) {
  await browser.waitUntil(async () => predicate(await getHistory()), { timeout });
  return getHistory();
}

module.exports = {
  activateCard,
  deactivateCard,
  getHistory,
  invoke,
  invokeError,
  refreshApp,
  resetNoCard,
  revealHeader,
  saveCard,
  saveHistory,
  sendMessage,
  setInput,
  toggleHistory,
  waitForHistory
};
