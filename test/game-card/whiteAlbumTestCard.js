const fs = require('node:fs');
const path = require('path');
const { readImportedJson } = require('./cardImportTestHelper');

const cardPath = path.join(__dirname, '../../game-card-examples/white-album-2/card.json');
const cardRoot = path.dirname(cardPath);
const card = readImportedJson(cardPath);
const stateSchema = require('../../game-card-examples/white-album-2/state/schema.json');
const llmStateContract = fs.readFileSync(
  path.join(__dirname, '../../game-card-examples/white-album-2/state/llm_schema.md'),
  'utf-8'
);

function readTextTree(relativeRoot) {
  const directory = path.join(cardRoot, relativeRoot);
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) return Object.entries(readTextTree(relativePath));
    return [[relativePath, fs.readFileSync(path.join(cardRoot, relativePath), 'utf-8')]];
  }));
}

const worldbookFileContents = {
  ...readTextTree('lib/worldbook'),
  ...readTextTree('worldbook')
};

module.exports = { card, stateSchema, llmStateContract, worldbookFileContents };
