import React from 'react';
import { act, renderHook, render, screen, fireEvent } from '@testing-library/react';
import useMainPresentation from '../../src/renderer/chat/useMainPresentation.js';
import useMainReading from '../../src/renderer/chat/useMainReading.js';
import useGameCardPresentation from '../../src/renderer/chat/useGameCardPresentation.js';
import MainMessages from '../../src/renderer/chat/MainMessages.jsx';
import AgentHistoryTitle from '../../src/renderer/components/AgentHistoryTitle.jsx';
import ChatPanelRenderers from '../../src/renderer/components/ChatPanelRenderers.jsx';

function session(initial = {}) {
  let view = { state: {}, contexts: { judge: { messages: [] }, narrator: { messages: [] } }, records: [], reading: null, ...initial };
  const listeners = new Set();
  return { view: () => view, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, advance: jest.fn(() => true),
    emit(next, detail) { view = { ...view, ...next }; listeners.forEach(fn => fn(view, detail)); } };
}
const record = { id: 'r1', role: 'assistant', mode: 'segmented', content: 'one\n\ntwo',
  units: [{ text: 'one', patches: [] }, { text: 'two', patches: ['{"count":1}'] }] };
test('one Enter follows the next live sentence after returning from history', () => {
  const main = session({ records: [record], reading: { recordId: record.id } });
  main.running = true;
  const surface = { current: document.body };
  const { result, rerender } = renderHook(({ view }) => useMainReading(main, view, surface, false),
    { initialProps: { view: main.view() } });
  act(() => result.current.navigate('reading.previous'));
  expect(result.current.page.text).toBe('one');
  act(() => result.current.navigate('reading.next'));
  expect(result.current.page.text).toBe('two');
  expect(main.advance).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'Enter' });
  expect(main.advance).toHaveBeenCalledTimes(1);
  const third = { ...record, content: 'one\n\ntwo\n\nthree',
    units: [...record.units, { text: 'three', patches: [] }] };
  rerender({ view: { ...main.view(), records: [third] } });
  expect(result.current.page.text).toBe('three');
  fireEvent.keyDown(window, { key: 'Enter' });
  expect(main.advance).toHaveBeenCalledTimes(2);
  const fourth = { ...third, units: [...third.units, { text: 'four', patches: [] }] };
  rerender({ view: { ...main.view(), records: [fourth] } });
  expect(result.current.page.text).toBe('four');
});
test('display-hidden units are auto-acknowledged and omitted from restored reading pages', () => {
  const hidden = { ...record, units: [...record.units, { text: '<summary>hidden</summary>', patches: [] }] };
  const main = session({ records: [hidden], reading: { recordId: hidden.id } });
  const display = { assistant: [{ stage: 'before_markdown', type: 'regex_replace',
    pattern: '<summary>.*?</summary>', replace: '' }] };
  const { result, rerender } = renderHook(({ view }) => useMainReading(main, view, { current: document.body }, false, undefined, display),
    { initialProps: { view: main.view() } });
  expect(main.advance).toHaveBeenCalledTimes(1);
  expect(result.current.page.text).toBe('two');
  expect(result.current.page.segmentIndex).toBe(1);
  rerender({ view: { ...main.view(), reading: null } });
  act(() => result.current.navigate('reading.previous'));
  expect(result.current.page.text).toBe('one');
  act(() => result.current.navigate('reading.latest'));
  expect(result.current.page.text).toBe('two');
  expect(main.advance).toHaveBeenCalledTimes(1);
});
test('new sessions present defaults before input; restoration prefers saved presentation over State', () => {
  const defaults = { visual: { scene: 'opening' }, audio: { bgm: 'theme' } };
  const main = session({ state: defaults });
  const card = { id: 'defaults' };
  const { result } = renderHook(() => {
    const presentation = useGameCardPresentation();
    useMainPresentation({ mainSession: main, card, presentation, setGameState: jest.fn() });
    return presentation;
  });
  expect(result.current.backgroundRequest.state).toEqual(defaults);
  expect(result.current.bgmRequest.state).toEqual(defaults);
  act(() => main.emit({}, { type: 'loading' }));
  act(() => main.emit({}, { type: 'restore' }));
  expect(result.current.backgroundRequest.state).toEqual(defaults);
  main.viewState = { presentation: { background: { visual: { scene: 'saved' } }, bgm: null } };
  const stopToken = result.current.bgmStopToken;
  act(() => main.emit({}, { type: 'restore' }));
  expect(result.current.backgroundRequest.state.visual.scene).toBe('saved');
  expect(result.current.capture().bgm).toBeNull();
  expect(result.current.bgmStopToken).toBeGreaterThan(stopToken);
});
test('reader State drives existing media requests and rollback restores actual pre-input targets', () => {
  const main = session({ state: { visual: { scene: 'old' }, audio: { bgm: 'old' } } });
  const card = { id: 'test', display: { segmentedReading: true } };
  const setGameState = jest.fn();
  const { result } = renderHook(() => {
    const presentation = useGameCardPresentation();
    const view = useMainPresentation({ mainSession: main, card, presentation, setGameState });
    return { presentation, view };
  });
  // The displayed scene need not equal the current State target.
  act(() => result.current.presentation.updateAll(card, { visual: { scene: 'displayed' }, audio: { bgm: 'saved' } }));
  act(() => main.emit({}, { type: 'start' }));
  const changed = { visual: { scene: 'new', portraits: { guide: 'smile' } }, audio: { bgm: 'theme' } };
  act(() => main.emit({ state: changed }, { type: 'reading-patch', updates: [{ operation: 'state.set', path: 'audio.bgm' }] }));
  expect(result.current.presentation.backgroundRequest.state).toEqual(changed);
  expect(result.current.presentation.portraitRequest.state).toEqual(changed);
  const bgmId = result.current.presentation.bgmRequest.id;
  act(() => main.emit({}, { type: 'reading-patch', updates: [{ operation: 'state.set', path: 'audio.bgm' }] }));
  expect(result.current.presentation.bgmRequest.id).toBeGreaterThan(bgmId);
  const beforeFailure = result.current.presentation.capture();
  act(() => main.emit({ reading: null }, { type: 'failed' }));
  expect(result.current.presentation.capture()).toEqual(beforeFailure);
  act(() => main.emit({ state: { visual: { scene: 'old' } } }, { type: 'rollback' }));
  expect(result.current.presentation.backgroundRequest.state.visual.scene).toBe('displayed');
  expect(result.current.presentation.bgmRequest.state.audio.bgm).toBe('saved');
  expect(setGameState).toHaveBeenLastCalledWith({ visual: { scene: 'old' } });
});
test('main reading history never reapplies patches; latest next only acknowledges the active reader', () => {
  const main = session({ records: [record], reading: { recordId: record.id } });
  const surface = { current: document.body };
  const { result, rerender } = renderHook(({ active, view }) => useMainReading(active, view, surface, false),
    { initialProps: { active: main, view: main.view() } });
  expect(result.current.page.text).toBe('two');
  act(() => result.current.navigate('reading.previous'));
  expect(result.current.page.text).toBe('one');
  act(() => result.current.navigate('reading.next'));
  expect(main.advance).not.toHaveBeenCalled();
  act(() => result.current.navigate('reading.next'));
  expect(main.advance).toHaveBeenCalledTimes(1);
  const next = session();
  rerender({ active: next, view: next.view() });
  expect(result.current.page).toBeUndefined();
  expect(result.current.ui.canNext).toBe(false);
});
test('existing renderers show only the selected unit, sanitize HTML and keep final Agent history separate', () => {
  const onSelect = jest.fn();
  const { rerender } = render(<><AgentHistoryTitle contexts={{ judge: {}, narrator: {} }} selected="judge" onSelect={onSelect} />
    <MainMessages messages={[record]} reading={{ page: { record, text: 'one<script>alert(1)</script>', id: 'r1:0' } }}
      isLoading={true} handleRetry={() => {}} /></>);
  expect(screen.queryByText('two')).toBeNull();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '下一个 Agent' }));
  expect(onSelect).toHaveBeenCalledWith('narrator');
  rerender(ChatPanelRenderers.renderMsgHistoryDisplay([{ id: 'msg-1', role: 'assistant', content: 'post_response final' }]));
  expect(screen.getByText(/post_response final/)).toBeTruthy();
  expect(screen.getByText(/msg-1/)).toBeTruthy();
  rerender(ChatPanelRenderers.renderMsgHistoryDisplay([]));
  expect(screen.getByText('暂无消息历史记录')).toBeTruthy();
});
