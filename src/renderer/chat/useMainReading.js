import React from 'react';
import { isSegmentAdvanceEvent } from './readingInteraction.js';
import { applyAssistantDisplayRules } from '../gameCard/displayRules.js';

function useMainReading(mainSession, view, surfaceRef, historyOpen, onPositionChange, display) {
  const pages = view.records.flatMap(record => record.mode === 'segmented'
    ? record.units.filter(unit => unit.text.trim()).map((unit, index) => ({ id: `${record.id}:${index}`, record, text: unit.text, segmentIndex: index }))
    : record.content ? [{ id: record.id, record, text: record.content, segmentIndex: 0 }] : [])
    .filter(page => applyAssistantDisplayRules(page.text, display, view.records.length - view.records.indexOf(page.record) - 1).trim());
  React.useEffect(() => {
    const record = view.records.find(item => item.id === view.reading?.recordId);
    const text = record?.units.at(-1)?.text;
    if (text !== undefined && !applyAssistantDisplayRules(text, display, 0).trim()) mainSession?.advance();
  }, [mainSession, view, display]);
  const [selection, setSelection] = React.useState(null);
  const selectionRef = React.useRef(selection);
  selectionRef.current = selection;
  React.useEffect(() => {
    let baseline;
    return mainSession?.subscribe((_, detail) => {
      if (detail.type === 'start') {
        if (!detail.retry) baseline = selectionRef.current;
        setSelection(null);
      } else if (detail.type === 'rollback') setSelection(baseline || null);
      else if (detail.type === 'restore' || detail.type === 'loading') setSelection(null);
    });
  }, [mainSession]);
  const saved = mainSession?.viewState?.reading;
  const savedPage = saved && pages.find(page => page.record.id === saved.messageId && page.segmentIndex === saved.segmentIndex);
  const selected = selection?.session === mainSession ? pages.findIndex(page => page.id === selection.id)
    : !mainSession?.running && !mainSession?.failed && savedPage ? pages.indexOf(savedPage) : -1;
  const index = selected >= 0 ? selected : pages.length - 1;
  const page = pages[index];
  const canAdvance = index === pages.length - 1 && Boolean(view.reading);
  const navigate = React.useCallback(type => {
    if (!mainSession) return false;
    if (type === 'reading.next' && canAdvance) {
      const advanced = mainSession.advance();
      if (advanced) setSelection(null);
      return advanced;
    }
    const next = type === 'reading.previous' ? index - 1 : type === 'reading.latest' ? pages.length - 1 : index + 1;
    if (next < 0 || next >= pages.length || next === index) return false;
    setSelection({ session: mainSession, id: pages[next].id });
    return true;
  }, [mainSession, canAdvance, index, pages]);
  React.useEffect(() => {
    if (!mainSession || mainSession.running || mainSession.failed || !page) return;
    const reading = { messageId: page.record.id, segmentIndex: page.segmentIndex };
    const saved = mainSession.viewState?.reading;
    if (saved?.messageId === reading.messageId && saved.segmentIndex === reading.segmentIndex) return;
    mainSession.setViewState?.({ reading });
    onPositionChange?.(reading);
  }, [mainSession, page?.id, onPositionChange, view]);
  const advanceVisiblePage = React.useCallback(event => {
    if (historyOpen || page?.record.mode !== 'segmented' || !isSegmentAdvanceEvent(event)) return false;
    return navigate('reading.next');
  }, [historyOpen, page, navigate]);
  React.useEffect(() => {
    if (!mainSession) return undefined;
    const target = surfaceRef.current?.ownerDocument.defaultView;
    const handler = event => {
      if (event.key === 'Enter' && !event.repeat && !event.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey
        && advanceVisiblePage(event)) event.preventDefault();
    };
    target?.addEventListener('keydown', handler);
    return () => target?.removeEventListener('keydown', handler);
  }, [mainSession, surfaceRef, advanceVisiblePage]);
  return { page, navigate, advanceVisiblePage, ui: { enabled: page?.record.mode === 'segmented',
    canPrevious: index > 0, canNext: index < pages.length - 1 || canAdvance, atLatest: index === pages.length - 1,
    messageIndex: view.records.indexOf(page?.record), segmentIndex: page?.segmentIndex ?? 0 } };
}

export default useMainReading;
