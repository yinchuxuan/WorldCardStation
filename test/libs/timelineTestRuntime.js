const fs = require('node:fs');
const path = require('node:path');
const { resolveExecSource } = require('../../src/renderer/gameCard/execSource');
const { applyGameCardAsync } = require('../../src/renderer/gameCard/engine');

const root = path.resolve(__dirname, '../../libs/timeline-library');
const scripts = Object.fromEntries(fs.readdirSync(path.join(root, 'lib/timeline'))
  .filter(name => name.endsWith('.js'))
  .map(name => [`lib/timeline/${name}`, fs.readFileSync(path.join(root, 'lib/timeline', name), 'utf8')]));
const coreSource = resolveExecSource({ sourceFile: 'lib/timeline/core.js' }, { fileContents: scripts });
const core = Function(coreSource + '\nreturn { parseTimelineTime, clampTimelineTime, selectTimelineSlot, resolveTimeline };')();
const at = time => `2007.10.21: ${time}`;
const config = {
  slots: [
    { id: 'free', range: { lte: at('14:00') }, end: at('16:00'), data: { section: 'FreePlot1' } },
    { id: 'fixed', range: { gt: at('14:00'), lte: at('16:00') }, end: at('18:00'), data: { section: 'FixedPlot1' } },
    { id: 'after', range: { gt: at('16:00') }, end: null }
  ]
};

function createCard(args = {}) {
  return {
    version: '1', id: 'timeline-test', name: 'Timeline',
    files: { timeline: { directory: 'timeline', include: ['config.json'] } },
    rules: [{ id: 'timeline', when: { phase: 'pre_send' }, then: [{
      type: 'exec', sourceFile: 'lib/timeline/index.js', args: { timeline: 'timeline', ...args }
    }] }]
  };
}

async function runTimeline(options = {}) {
  const card = options.card ?? createCard(options.args);
  const files = { 'timeline/config.json': JSON.stringify(options.config ?? config), ...options.files };
  const readText = jest.fn(async file => {
    if (!Object.hasOwn(files, file)) throw new Error(`missing timeline test file: ${file}`);
    return files[file];
  });
  const result = await applyGameCardAsync({
    card, phase: 'pre_send', messages: [{ role: 'user', content: '继续' }],
    state: options.state ?? { timeline: { currentTime: at('13:00') } },
    fileContents: scripts, dependencies: { readText }
  });
  return { ...result, readText, report: result.trace.rules[0]?.actions[0]?.effects?.timeline };
}

module.exports = { root, scripts, core, at, config, createCard, runTimeline };
