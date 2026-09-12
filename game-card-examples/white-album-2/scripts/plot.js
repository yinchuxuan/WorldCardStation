/* eslint-disable no-unused-vars */
/* global include, resolveAttitudeSection, resolveChapter1EventCategory, resolveChapter1Timeline, resolveChapter2EventCategory, resolveChapter2Timeline, resolvePlotMood */
/* global clampTimelineTime, parseTimelineTime */
/* exported run */

include("lib/timeline/core.js");
include("./chapters/chapter-1.js");
include("./chapters/chapter-2.js");

async function run(ctx) {
  const { state, utils } = ctx;

  function ensureObject(path) {
    if (!state[path] || typeof state[path] !== 'object') state[path] = {};
  }

  function chapterKey() {
    if (state.story && (state.story.chapter2GameEnd1Reached || state.story.chapter2SuccessReached)) {
      return 'chapter_2';
    }

    const currentTime = state.timeline && state.timeline.currentTime;
    const chapter2Start = parseTimelineTime('2007.10.23: 17:00 星期二');
    return parseTimelineTime(currentTime) > chapter2Start ? 'chapter_2' : 'chapter_1';
  }

  function applyAttitudeSections() {
    state.temp.toumaAttitudeSection = resolveAttitudeSection(
      'ToumaAttitude', state.touma && state.touma.affection, 25
    );
    state.temp.setsunaAttitudeSection = resolveAttitudeSection(
      'SetsunaAttitude', state.setsuna && state.setsuna.affection, 15
    );
  }

  function applyFreePlot() {
    const roll = utils.randomInt(1, 100);
    const mood = resolvePlotMood(roll);
    const characterGuideRoll = utils.randomInt(1, 100);
    const hasEvent = mood !== 'normal'
      && ['plot.chapter.1', 'plot.chapter.2'].indexOf(state.temp.plotFile) !== -1;
    const eventRoll = hasEvent ? utils.randomInt(1, 100) : 0;
    let eventCategory = '';
    if (state.temp.plotFile === 'plot.chapter.1' && hasEvent) {
      eventCategory = resolveChapter1EventCategory(eventRoll);
    } else if (state.temp.plotFile === 'plot.chapter.2' && hasEvent) {
      eventCategory = resolveChapter2EventCategory(eventRoll);
    }
    state.temp.plotKind = 'free';
    state.temp.includeFreeGuide = true;
    state.temp.plotDirectionRoll = roll;
    state.temp.characterGuideRoll = characterGuideRoll;
    state.temp.plotMood = mood;
    state.temp.plotMoodSection = `PlotMood_${mood}`;
    state.temp.plotEventRoll = eventRoll;
    state.temp.plotEventCategory = eventCategory;
    state.temp.plotEventSection = eventCategory ? `PlotEvent_${eventCategory}` : '';
    applyAttitudeSections();
  }

  function applyFixedPlot() {
    state.temp.plotKind = 'fixed';
    state.temp.includeFreeGuide = false;
    state.temp.characterGuideRoll = 0;
    state.temp.plotMood = '';
    state.temp.plotMoodSection = '';
    state.temp.plotEventRoll = 0;
    state.temp.plotEventCategory = '';
    state.temp.plotEventSection = '';
    applyAttitudeSections();
  }

  const resolvers = { chapter_1: resolveChapter1Timeline, chapter_2: resolveChapter2Timeline };
  ensureObject('timeline');
  ensureObject('temp');
  ensureObject('story');

  const time = clampTimelineTime(state.timeline.currentTime, state.timeline.currentSlotEnd);
  state.timeline.currentTime = time.currentTime;
  state.temp.timelineTimeClamped = time.clamped;
  state.temp.timelineRequestedTime = time.clamped ? time.requestedTime : '';
  const resolver = resolvers[chapterKey()] || resolveChapter1Timeline;
  const result = await resolver(state, ctx);

  state.timeline.currentSlot = result.slotId || result.plotType;
  state.timeline.currentSlotEnd = result.end;
  state.story.chapter = result.chapter;
  state.story.progress = result.slotId || result.plotType;
  state.temp.plotFile = result.plotFile;
  state.temp.PlotType = result.plotType;

  if (result.plotKind === 'free') applyFreePlot();
  else if (result.plotKind === 'fixed') applyFixedPlot();

  const diagnostics = result.diagnostics || {
    selected: state.timeline.currentSlot, matched: [], fallbackUsed: false,
    warnings: [], selectionSkipped: 'afterstory'
  };
  return { state, effects: { timeline: {
    ...time, ...diagnostics, chapter: result.chapter,
    slotId: state.timeline.currentSlot, plotType: result.plotType,
    plotFile: result.plotFile, end: result.end
  } } };
}
