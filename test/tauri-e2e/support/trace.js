/* global browser */
const fs = require('node:fs');
const path = require('node:path');
const { invoke } = require('./tauri');
const dataDir = path.resolve('test-results/tauri-e2e/data/game-cards/cards');
const tracePath = (id, session = 'default') => path.join(dataDir, id, 'sessions', session, 'trace.jsonl');
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

async function currentTrace() {
  const text = await invoke('get_game_card_development_instructions');
  const { gameCardsPath } = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)[1]);
  const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const cardId = json(path.join(gameCardsPath, 'active.json')).id;
  const root = path.join(gameCardsPath, 'cards', cardId, 'sessions');
  const sessionId = json(path.join(root, 'active.json')).id;
  const session = json(path.join(root, 'index.json')).sessions.find(item => item.id === sessionId);
  return { cardId, session, file: path.join(root, sessionId, 'trace.jsonl') };
}

async function waitEvent(file, type) {
  await browser.waitUntil(() => read(file).some(event => event.type === type));
  return read(file);
}

module.exports = { tracePath, read, currentTrace, waitEvent };
