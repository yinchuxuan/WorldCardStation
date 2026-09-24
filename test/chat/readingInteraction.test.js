import { isSegmentAdvanceEvent } from '../../src/renderer/chat/readingInteraction.js';

test('reading accepts surface clicks but not interactive children or selected text', () => {
  const surface = document.createElement('div');
  const event = { type: 'click', button: 0, currentTarget: surface, target: surface };
  expect(isSegmentAdvanceEvent(event)).toBe(true);
  for (const tag of ['a', 'button', 'input', 'textarea', 'select', 'label']) {
    const child = document.createElement(tag);
    surface.appendChild(child);
    expect(isSegmentAdvanceEvent({ ...event, target: child })).toBe(false);
  }
  const header = document.createElement('div');
  header.setAttribute('data-gc-part', 'chat-header');
  surface.appendChild(header);
  expect(isSegmentAdvanceEvent({ ...event, target: header })).toBe(false);
  expect(isSegmentAdvanceEvent({ ...event, button: 2 })).toBe(false);
  expect(isSegmentAdvanceEvent({ ...event, defaultPrevented: true })).toBe(false);
  const selection = jest.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false });
  expect(isSegmentAdvanceEvent(event)).toBe(false);
  selection.mockRestore();
});
