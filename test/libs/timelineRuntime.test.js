const { at, config, createCard, runTimeline } = require('./timelineTestRuntime');

describe('timeline library exec integration', () => {
  test('updates only its result fields and exposes diagnostics through platform trace', async () => {
    const state = { player: { hp: 5 }, timeline: { currentTime: at('18:30'), currentSlotEnd: at('16:00'), own: true } };
    const result = await runTimeline({ state });
    expect(result.trace.errors).toEqual([]);
    expect(result.state).toEqual({
      player: { hp: 5 }, timeline: {
        currentTime: at('16:00'), currentSlot: 'fixed', currentSlotEnd: at('18:00'),
        own: true, data: { section: 'FixedPlot1' }
      }
    });
    expect(result.report).toMatchObject({ clamped: true, selected: 'fixed', previousEnd: at('16:00') });
    expect(result.messages).toEqual([{ role: 'user', content: '继续' }]);
    expect(state.timeline.currentTime).toBe(at('18:30'));
    expect(result.readText.mock.calls).toEqual([['timeline/config.json']]);
  });

  test('restores from ordinary session state and clears previous node data without changing other fields', async () => {
    const first = await runTimeline();
    const state = JSON.parse(JSON.stringify(first.state));
    state.timeline.currentTime = at('16:00');
    const second = await runTimeline({ state });
    expect(second.state.timeline.currentSlot).toBe('fixed');
    const third = await runTimeline({ state: {
      ...second.state, timeline: { ...second.state.timeline, currentTime: at('18:00') }
    } });
    expect(third.state.timeline).toEqual({ currentTime: at('18:00'), currentSlot: 'after', currentSlotEnd: '', data: {} });
    expect(third.report.clamped).toBe(false);
  });

  test('a caller-owned scope and filename still use the same authorized reader', async () => {
    const card = createCard({ timeline: 'schedule', config: 'day.json' });
    card.files = { schedule: { directory: 'data', include: ['day.json'] } };
    const result = await runTimeline({ card, files: { 'data/day.json': JSON.stringify(config) } });
    expect(result.trace.errors).toEqual([]);
    expect(result.readText.mock.calls).toEqual([['data/day.json']]);
  });

  test('an unlimited node remains compatible with a string state schema', async () => {
    const card = createCard();
    card.state = { schema: {
      'timeline.currentTime': { type: 'string', default: at('18:00'), llmWrite: true },
      'timeline.currentSlotEnd': { type: 'string', default: '', llmWrite: false }
    } };
    const result = await runTimeline({ card, state: { timeline: { currentTime: at('18:00') } } });
    expect(result.trace.errors).toEqual([]);
    expect(result.state.timeline.currentSlotEnd).toBe('');
    expect(result.state.timeline.currentSlot).toBe('after');
  });

  test.each([
    [{ config: '../secret.json' }, 'scope'],
    [{ config: '/secret.json' }, 'scope'],
    [{ config: 'other.json' }, 'outside scope'],
    [{ timeline: 'missing' }, 'scope'],
    [{ timeline: '' }, 'timeline scope is required']
  ])('does not bypass files registration with args %j', async (args, error) => {
    const result = await runTimeline({ args });
    expect(result.trace.errors[0]).toContain(error);
    expect(result.readText).not.toHaveBeenCalled();
  });

  test.each([
    [{ 'timeline/config.json': '{' }, 'invalid timeline config'],
    [{ 'timeline/config.json': '{"slots":[]}' }, 'config.slots']
  ])('parse and config errors do not commit state or messages', async (files, error) => {
    const state = { owned: 7, timeline: { currentTime: at('18:30'), currentSlotEnd: at('16:00') } };
    const result = await runTimeline({ files, state });
    expect(result.trace.errors[0]).toContain(error);
    expect(result.state).toEqual(state);
    expect(result.report).toBeUndefined();
    expect(result.messages).toEqual([{ role: 'user', content: '继续' }]);
  });

  test('reports missing files and invalid state without replacing caller values', async () => {
    const card = createCard({ config: 'missing.json' });
    card.files.timeline.include.push('missing.json');
    const missing = await runTimeline({ card });
    expect(missing.trace.errors[0]).toContain('missing timeline test file');
    const state = { timeline: 'owned by card' };
    const collision = await runTimeline({ state });
    expect(collision.trace.errors[0]).toContain('state.timeline must be an object');
    expect(collision.state).toEqual(state);
    const badTime = await runTimeline({ state: { timeline: { currentTime: 'bad' } } });
    expect(badTime.trace.errors[0]).toContain('invalid time');
  });

  test('reads changed configuration again and does not retain another invocation’s selection', async () => {
    const first = await runTimeline();
    const changed = { slots: [{ ...config.slots[0], id: 'updated' }] };
    const second = await runTimeline({ config: changed, state: first.state });
    expect(first.state.timeline.currentSlot).toBe('free');
    expect(second.state.timeline.currentSlot).toBe('updated');
    expect(second.readText).toHaveBeenCalledTimes(1);
  });
});
