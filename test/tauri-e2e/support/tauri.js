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
  await $('.chat-input-textarea').waitForExist();
  await $('.chat-input-textarea').waitForEnabled();
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
  // Pin the test window before navigation so the service does not run focus-detection JS mid-reload.
  await browser.tauri.switchWindow('main');
  await browser.execute(() => document.documentElement.setAttribute('data-e2e-refresh-pending', ''));
  await browser.refresh();
  // Use native element lookup: execute/sync can lose its window-stored result during navigation.
  // Exclude the old document even while its app shell is still mounted.
  await $('html:not([data-e2e-refresh-pending]) .app-container').waitForExist();
  // Background WebViews can suspend CSS animations, leaving the app transparent.
  await invoke('plugin:window|set_focus', { label: 'main' });
}

async function revealHeader() {
  // The app shell mounts before the asynchronous chat/session initialization finishes.
  await $('.chat-header-hover-trigger').waitForExist();
  await invoke('plugin:window|set_focus', { label: 'main' });
  // Target the header itself: revealing it covers the trigger and can emit mouseleave on WebKit.
  await browser.execute(() => document.querySelector('.chat-header').dispatchEvent(
    new MouseEvent('mouseover', { bubbles: true, relatedTarget: null })
  ));
  // Background WebKit can suspend finite entrance animations at opacity: 0.
  await browser.execute(() => document.getAnimations().forEach(animation => {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }));
  await $('.chat-header-visible').waitForDisplayed();
}

async function toggleHistory() {
  await revealHeader();
  await browser.execute(() => document.querySelector('.chat-header-clickable')?.click());
}

async function saveCard(card, files = {}) {
  await invoke('e2e_seed_game_card', { card });
  await writeCardFiles(card.id, { ...require('./cards').cardFiles(card), ...files });
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
  // Let the old renderer detach before creating the ordinary-chat test session.
  await refreshApp();
  const created = await invoke('create_chat_session', { title: 'Isolated ordinary chat' });
  await invoke('set_active_chat_session', { id: created.id });
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
