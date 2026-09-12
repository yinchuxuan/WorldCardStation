const fs = require('node:fs');
const path = require('node:path');

const cardDir = path.join(__dirname, '../../game-card-examples/white-album-2');
const visual = require('../../game-card-examples/white-album-2/visual.json');
const audio = require('../../game-card-examples/white-album-2/audio.json');

const plotResources = [
  ['plot/chapter-1.md', 'FixedPlot1', null, 'WA_piano'],
  ['plot/chapter-1.md', 'FixedPlot2', 'invite', null],
  ['plot/chapter-1.md', 'FixedPlot3', 'haiku', null],
  ['plot/chapter-1.md', 'FixedPlot4', 'rooftop', 'WA_3'],
  ['plot/chapter-2.md', 'FixedPlot1', 'rooftop2', 'dream'],
  ['plot/chapter-2.md', 'FixedPlot2', 'park', 'snow_scene'],
  ['plot/chapter-2.md', 'FixedPlot2Low', 'park', 'snow_scene'],
  ['plot/chapter-2.md', 'FixedPlot3', 'ktv', 'bad_woman'],
  ['plot/chapter-2.md', 'FixedPlot4', 'touma_hand', 'after_all_piano'],
  ['plot/chapter-2.md', 'FixedPlot5', null, null],
  ['plot/chapter-2.md', 'FixedPlot6', 'home_party', 'winter_night'],
  ['plot/chapter-2.md', 'FixedPlot7', 'agreement', 'things'],
  ['plot/chapter-2.md', 'GameEnd1', 'GameEnd1', 'unstoppable_dream']
];

const memoryPolicies = [
  ['plot/chapter-1.md', 'FixedPlot1', true],
  ['plot/chapter-1.md', 'FixedPlot2', false],
  ['plot/chapter-1.md', 'FixedPlot3', false],
  ['plot/chapter-1.md', 'FixedPlot4', true],
  ['plot/chapter-2.md', 'FixedPlot1', true],
  ['plot/chapter-2.md', 'FixedPlot2', true],
  ['plot/chapter-2.md', 'FixedPlot2Low', true],
  ['plot/chapter-2.md', 'FixedPlot3', true],
  ['plot/chapter-2.md', 'FixedPlot4', true],
  ['plot/chapter-2.md', 'FixedPlot5', true],
  ['plot/chapter-2.md', 'FixedPlot6', false],
  ['plot/chapter-2.md', 'FixedPlot7', true],
  ['plot/chapter-2.md', 'GameEnd1', true]
];

function readCardFile(relativePath) {
  return fs.readFileSync(path.join(cardDir, relativePath), 'utf-8');
}

function readSection(markdown, heading) {
  const marker = `## ${heading}\n`;
  const start = markdown.indexOf(marker);
  const bodyStart = start + marker.length;
  const end = markdown.indexOf('\n## ', bodyStart);
  return markdown.slice(bodyStart, end === -1 ? markdown.length : end);
}

describe('white album fixed plot presentation resources', () => {
  test.each(plotResources)('%s#%s declares valid local resources', (file, sectionName, scene, bgm) => {
    const section = readSection(readCardFile(file), sectionName);

    expect(section).toContain('### 本节点特殊演出资源');
    if (scene) {
      expect(section).toContain(`visual.scene: \`${scene}\``);
      expect(visual.cg[scene]).toBeDefined();
    } else {
      expect(section).not.toContain('visual.scene:');
    }
    if (bgm) {
      expect(section).toContain(`audio.bgm: \`${bgm}\``);
      expect(audio.bgm[bgm]).toBeDefined();
    } else {
      expect(section).not.toContain('audio.bgm:');
    }
  });

  test('fixed plot 4 stages the window cg before Touma catches Haruki', () => {
    const section = readSection(readCardFile('plot/chapter-2.md'), 'FixedPlot4');
    const windowScene = section.indexOf('visual.scene: `window`');
    const toumaHandScene = section.indexOf('visual.scene: `touma_hand`');

    expect(windowScene).toBeGreaterThanOrEqual(0);
    expect(toumaHandScene).toBeGreaterThan(windowScene);
    expect(visual.cg.window).toBe('images/background/story/window.png');
  });

  test('timeline code does not own presentation resource hints', () => {
    const timeline = [
      readCardFile('scripts/plot.js'),
      readCardFile('scripts/chapters/chapter-1.js'),
      readCardFile('scripts/chapters/chapter-2.js'),
      readCardFile('rules/tail-timeline-guide.json')
    ].join('\n');

    expect(timeline).not.toMatch(/nodeBackground|nodeBgm/);
    expect(timeline).not.toMatch(/background:|bgm:/);
    expect(timeline).not.toContain('## 本节点演出资源');
  });

  test.each(memoryPolicies)('%s#%s declares its anchor policy', (file, sectionName, required) => {
    const section = readSection(readCardFile(file), sectionName);
    const policy = required
      ? '记忆要求：本节点完成后新增一条 anchor'
      : '记忆要求：本节点不新增 anchor';

    expect(section).toContain(policy);
    expect(section.match(/记忆要求：/g)).toHaveLength(1);
  });

  test('global rules make anchors rare instead of mandatory for fixed plots', () => {
    const rules = readCardFile('roleplay_rules.md');

    expect(rules).toContain('`priority="anchor"`：默认省略');
    expect(rules).toContain('固定节点不当然产生 anchor');
    expect(rules).not.toContain('固定节点必须记录anchor');
  });

  test('global rules require plot constraints to be checked in CoT', () => {
    const rules = readCardFile('roleplay_rules.md');

    expect(rules).toContain('必须在CoT中明确加载本轮剧情引导的“剧情限制”');
    expect(rules).toContain('逐条引用限制序号并分别标记“满足”或“需修正”');
    expect(rules).toContain('再从第一条开始重新检查，直到全部满足');
    expect(rules).toContain('最终输出前再次按序号逐项复检');
    expect(rules).toContain('先调整情节再输出');
  });
});
