import { collectExecDependencies } from './execDependencies.js';
import { collectExecSourcePaths, collectFileContentPaths } from './resourcePreload.js';
import { loadExternalStateSchema } from './stateSchemaLoader.js';

const missingResources = {};
const missingCard = {};
let entriesByCard = new WeakMap();
let runtimeRevision = 0;

function cacheEntry(card, resources) {
  const cardKey = card && typeof card === 'object' ? card : missingCard;
  const resourceKey = resources && typeof resources === 'object' ? resources : missingResources;
  let entries = entriesByCard.get(cardKey);
  if (!entries) {
    entries = new WeakMap();
    entriesByCard.set(cardKey, entries);
  }
  if (!entries.has(resourceKey)) {
    entries.set(resourceKey, {
      card: null,
      directIncludes: new Map(),
      files: null,
      scripts: new Map(),
      text: new Map()
    });
  }
  return entries.get(resourceKey);
}

function readCachedCardText(card, resources, filePath) {
  const entry = cacheEntry(card, resources);
  if (!entry.text.has(filePath)) {
    if (!card?.id || typeof resources?.readText !== 'function') {
      entry.text.set(filePath, Promise.reject(new Error('game card files require resources.readText')));
    } else {
      entry.text.set(filePath, Promise.resolve(resources.readText(card.id, filePath)));
    }
  }
  return entry.text.get(filePath);
}

function loadCachedRuntimeCard(card, resources) {
  if (!card) return Promise.resolve(null);
  const entry = cacheEntry(card, resources);
  if (!entry.card) {
    const cachedResources = {
      ...resources,
      readText: (_cardId, filePath) => readCachedCardText(card, resources, filePath)
    };
    entry.card = loadExternalStateSchema(card, cachedResources)
      .then(runtimeCard => {
        if (runtimeCard && typeof runtimeCard === 'object') {
          const cardEntries = entriesByCard.get(runtimeCard) || new WeakMap();
          cardEntries.set(resources && typeof resources === 'object' ? resources : missingResources, entry);
          entriesByCard.set(runtimeCard, cardEntries);
        }
        return runtimeCard;
      });
  }
  return entry.card;
}

async function buildFileContents(card, resources, runtimeCard, scriptPaths) {
  const paths = new Set(collectFileContentPaths(runtimeCard));
  await Promise.all([...paths].map(path => readCachedCardText(card, resources, path)));
  const scripts = await collectExecDependencies(scriptPaths, path => readCachedCardText(card, resources, path),
    cacheEntry(card, resources).directIncludes);
  scripts.forEach(path => paths.add(path));
  const entries = await Promise.all([...paths].map(async path => (
    [path, await readCachedCardText(card, resources, path) || '']
  )));
  return Object.fromEntries(entries);
}

async function loadCachedCardResources(card, resources) {
  const entry = cacheEntry(card, resources);
  if (!entry.files) {
    entry.files = loadCachedRuntimeCard(card, resources).then(async runtimeCard => ({
      card: runtimeCard,
      fileContents: await buildFileContents(
        card,
        resources,
        runtimeCard,
        collectExecSourcePaths(runtimeCard)
      )
    }));
  }
  return entry.files;
}

async function loadCachedUiScriptResources(card, resources, sourceFile) {
  const entry = cacheEntry(card, resources);
  if (!entry.scripts.has(sourceFile)) {
    const loaded = loadCachedRuntimeCard(card, resources).then(async runtimeCard => ({
      card: runtimeCard,
      fileContents: await buildFileContents(card, resources, runtimeCard, [sourceFile])
    }));
    entry.scripts.set(sourceFile, loaded);
  }
  return entry.scripts.get(sourceFile);
}

function invalidateGameCardRuntimeCache() {
  entriesByCard = new WeakMap();
  runtimeRevision += 1;
}

function getGameCardRuntimeRevision() {
  return runtimeRevision;
}

export {
  getGameCardRuntimeRevision,
  invalidateGameCardRuntimeCache,
  loadCachedCardResources,
  loadCachedRuntimeCard,
  loadCachedUiScriptResources,
  readCachedCardText
};
