const { core, at, config } = require('./timelineTestRuntime');
const { parseTimelineTime, clampTimelineTime, selectTimelineSlot, resolveTimeline } = core;

describe('timeline parsing and selection core', () => {
  test('uses calendar values, permits legacy unpadded fields and ignores weekday text', () => {
    expect(parseTimelineTime('2007.2.3: 8:05 星期六')).toBe(Date.UTC(2007, 1, 3, 8, 5));
    expect(parseTimelineTime('2007.02.03: 08:05 星期一')).toBe(Date.UTC(2007, 1, 3, 8, 5));
    expect(parseTimelineTime('0099.01.01: 00:00')).toBeLessThan(parseTimelineTime('0100.01.01: 00:00'));
    expect(parseTimelineTime('2024.02.29: 23:59')).toBe(Date.UTC(2024, 1, 29, 23, 59));
  });

  test.each([
    undefined, null, 10, '', 'bad', '2007.02.29: 12:00', '2024.02.30: 12:00',
    '2007.13.01: 00:00', '2007.00.01: 00:00', '2007.01.00: 00:00',
    '2007.01.01: 24:00', '2007.01.01: 12:60', '0000.01.01: 00:00',
    '2007.01.01: 12:00 trailing', '2007-01-01T12:00:00Z'
  ])('rejects invalid time instead of rolling dates or selecting a default: %s', value => {
    expect(() => parseTimelineTime(value, 'slot.end')).toThrow('timeline slot.end: invalid');
  });

  test.each([
    ['13:59', 'free'], ['14:00', 'free'], ['14:01', 'fixed'],
    ['16:00', 'fixed'], ['16:01', 'after']
  ])('selects %s using explicit open/closed bounds', (time, id) => {
    expect(selectTimelineSlot(config, at(time)).slot.id).toBe(id);
  });

  test('supports inclusive lower and exclusive upper bounds, including a single time point', () => {
    const slots = [
      { id: 'one', range: { gte: at('14:00'), lt: at('16:00') }, end: null },
      { id: 'point', range: { gte: at('16:00'), lte: at('16:00') }, end: null }
    ];
    expect(selectTimelineSlot({ slots }, at('14:00')).slot.id).toBe('one');
    expect(selectTimelineSlot({ slots }, at('16:00')).slot.id).toBe('point');
    expect(() => selectTimelineSlot({ slots }, at('16:01'))).toThrow('no slot matches');
  });

  test('clamps against the previous limit before selecting, not the newly selected limit', () => {
    const result = resolveTimeline(config, { currentTime: at('18:30'), currentSlotEnd: at('16:00') });
    expect(result.currentTime).toBe(at('16:00'));
    expect(result.slot).toMatchObject({ id: 'fixed', end: at('18:00') });
    expect(result.diagnostics).toMatchObject({
      requestedTime: at('18:30'), previousEnd: at('16:00'), currentTime: at('16:00'),
      clamped: true, selected: 'fixed', matched: ['fixed'], fallbackUsed: false, warnings: []
    });
  });

  test.each([undefined, null, ''])('allows an absent previous limit: %s', end => {
    expect(clampTimelineTime(at('18:30'), end)).toMatchObject({ currentTime: at('18:30'), clamped: false });
  });

  test('does not advance time, clamp equality, prevent backward time or mutate input', () => {
    const input = Object.freeze({ currentTime: at('16:00'), currentSlotEnd: at('16:00') });
    expect(resolveTimeline(config, input).diagnostics.clamped).toBe(false);
    expect(clampTimelineTime(at('12:00'), at('16:00')).currentTime).toBe(at('12:00'));
    const result = selectTimelineSlot(config, at('13:00'));
    result.slot.data.section = 'changed';
    expect(config.slots[0].data.section).toBe('FreePlot1');
    expect(input.currentTime).toBe(at('16:00'));
  });

  test('requires explicit fallback and reports its use', () => {
    const gap = { slots: [config.slots[1]] };
    expect(() => selectTimelineSlot(gap, at('12:00'))).toThrow('configure an explicit fallback');
    const result = selectTimelineSlot({ ...gap, fallback: 'fixed' }, at('12:00'));
    expect(result.diagnostics).toEqual({
      selected: 'fixed', matched: [], fallbackUsed: true, warnings: ['No slot matched; using fallback fixed']
    });
  });

  test('overlaps follow declaration order and report all matches', () => {
    const overlapping = { slots: [config.slots[0], { id: 'any', range: {}, end: null }] };
    const result = selectTimelineSlot(overlapping, at('13:00'));
    expect(result.slot.id).toBe('free');
    expect(result.diagnostics.matched).toEqual(['free', 'any']);
    expect(result.diagnostics.warnings).toEqual(['Multiple slots matched; using first slot free']);
  });

  test.each([
    [null, 'config.slots'], [{ slots: [] }, 'config.slots'],
    [{ slots: [null] }, 'slots[0].id'],
    [{ slots: [config.slots[0], config.slots[0]] }, 'duplicate slot id'],
    [{ ...config, fallback: 'missing' }, 'config.fallback'],
    [{ slots: [{ ...config.slots[0], end: 'bad' }] }, 'slots[0].end'],
    [{ slots: [{ ...config.slots[0], end: undefined }] }, 'slots[0].end'],
    [{ slots: [{ ...config.slots[0], data: [] }] }, 'slots[0].data']
  ])('validates configuration before returning a selection', (value, error) => {
    expect(() => selectTimelineSlot(value, at('13:00'))).toThrow(error);
  });

  test.each([
    [null, 'range must'], [[], 'range must'], [{ before: at('16:00') }, 'unknown range operator'],
    [{ gt: 'bad' }, 'slots[0].range.gt'],
    [{ gt: at('16:00'), lte: at('14:00') }, 'empty or reversed'],
    [{ gt: at('14:00'), lte: at('14:00') }, 'empty or reversed'],
    [{ gt: at('14:00'), gte: at('14:00') }, 'one lower'],
    [{ lt: at('14:00'), lte: at('14:00') }, 'one lower']
  ])('rejects invalid ranges rather than silently ignoring them', (range, error) => {
    expect(() => selectTimelineSlot({ slots: [{ ...config.slots[0], range }] }, at('13:00'))).toThrow(error);
  });
});
