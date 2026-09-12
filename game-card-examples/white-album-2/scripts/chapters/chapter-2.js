/* eslint-disable no-unused-vars */
/* global loadTimelineConfig, selectTimelineSlot */
/* exported resolveChapter2EventCategory, resolveChapter2Timeline */

function resolveChapter2EventCategory(roll) {
  if (roll <= 40) return 'touma_setsuna';
  if (roll <= 65) return 'music';
  if (roll <= 85) return 'friends';
  return 'personal';
}

function setsunaAffection(state) {
  const value = state.setsuna && state.setsuna.affection;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function toumaAffection(state) {
  const value = state.touma && state.touma.affection;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function performanceProficiency(state) {
  const value = state.performance && state.performance.proficiency;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function readStatePath(state, path) {
  return path.split('.').reduce((target, key) => (target ? target[key] : undefined), state);
}

function writeStatePath(state, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = state;
  keys.forEach((key) => {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  });
  target[last] = value;
}

const chapter2BranchRules = [
  {
    statePath: 'story.chapter2SetsunaBranch',
    decideOn: ['FixedPlot2', 'FixedPlot3', 'FixedPlot4'],
    lockedValues: ['secret', 'reserved'],
    decide: (state) => (setsunaAffection(state) >= 15 ? 'secret' : 'reserved')
  }
];

const chapter2SlotPlotOverrides = {
  FixedPlot2: {
    'story.chapter2SetsunaBranch': {
      reserved: { plotType: 'FixedPlot2Low' }
    }
  },
  FixedPlot3: {
    'story.chapter2SetsunaBranch': {
      reserved: { plotType: 'FixedPlot3Low', plotKind: 'free' }
    }
  }
};

const chapter2ConditionalSlotPlotOverrides = [
  {
    slotId: 'GameEnd1',
    when: (state) => readStatePath(state, 'story.chapter2SetsunaBranch') === 'secret'
      && setsunaAffection(state) >= 20
      && toumaAffection(state) >= 30
      && performanceProficiency(state) >= 20,
    override: {
      plotType: 'FixedPlot7',
      end: '2007.10.28: 22:00 星期日'
    }
  }
];

function resolveBranch(state, slot, rule) {
  if (rule.decideOn.indexOf(slot.id) === -1) return null;

  const current = readStatePath(state, rule.statePath);
  const locked = rule.lockedValues.indexOf(current) !== -1;
  if (locked) return { statePath: rule.statePath, value: current, locked };

  const value = rule.decide(state);
  writeStatePath(state, rule.statePath, value);
  return { statePath: rule.statePath, value, locked };
}

function resolveBranches(state, slot) {
  return chapter2BranchRules
    .map((rule) => resolveBranch(state, slot, rule))
    .filter(Boolean);
}

function applySlotPlotOverrides(state, slot) {
  const branches = resolveBranches(state, slot);
  const branchedSlot = branches.reduce((current, branch) => {
    const overrides = chapter2SlotPlotOverrides[slot.id] && chapter2SlotPlotOverrides[slot.id][branch.statePath];
    if (!overrides) return current;

    const lockedKey = `${branch.value}Locked`;
    const override = (branch.locked && overrides[lockedKey]) || overrides[branch.value];
    return override ? { ...current, ...override } : current;
  }, { ...slot, plotType: slot.id, slotId: slot.id });
  return chapter2ConditionalSlotPlotOverrides.reduce((current, item) => {
    return item.slotId === slot.id && item.when(state) ? { ...current, ...item.override } : current;
  }, branchedSlot);
}

async function resolveChapter2Timeline(state, ctx) {
  if (readStatePath(state, 'story.chapter2SuccessReached')) {
    return {
      chapter: 'chapter_2',
      plotFile: 'plot.chapter.2.successAfterstory',
      slotId: 'Chapter2SuccessAfterstory',
      plotType: 'Chapter2SuccessAfterstory',
      plotKind: 'free',
      end: '2099.12.31: 23:59 星期四'
    };
  }

  if (readStatePath(state, 'story.chapter2GameEnd1Reached')) {
    return {
      chapter: 'chapter_2',
      plotFile: 'plot.chapter.2.gameEnd1Afterstory',
      slotId: 'GameEnd1Afterstory',
      plotType: 'GameEnd1Afterstory',
      plotKind: 'free',
      end: '2099.12.31: 23:59 星期四'
    };
  }

  const config = await loadTimelineConfig(ctx, { ...ctx.args, config: 'chapter-2.json' });
  const selection = selectTimelineSlot(config, state.timeline.currentTime);
  const rawSlot = { ...selection.slot.data, id: selection.slot.id, end: selection.slot.end };
  const slot = applySlotPlotOverrides(state, rawSlot);
  if (slot.plotType === 'FixedPlot7') writeStatePath(state, 'story.chapter2SuccessReached', true);
  if (slot.plotType === 'GameEnd1') writeStatePath(state, 'story.chapter2GameEnd1Reached', true);
  return {
    chapter: 'chapter_2',
    plotFile: 'plot.chapter.2',
    slotId: slot.slotId,
    plotType: slot.plotType,
    plotKind: slot.plotKind,
    end: slot.end,
    diagnostics: selection.diagnostics
  };
}
