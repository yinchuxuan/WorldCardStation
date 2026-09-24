import React from 'react';
import { isSegmentAdvanceEvent } from './useSegmentedReading.js';

function useMainReading(mainSession, view, surfaceRef, historyOpen) {
  const pages = view.records.flatMap(record => record.mode === 'segmented'
    ? record.units.filter(unit => unit.text.trim()).map((unit, index) => ({ id: `${record.id}:${index}`, record, text: unit.text, segmentIndex: index }))
    : record.content ? [{ id: record.id, record, text: record.content, segmentIndex: 0 }] : []);
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
    });
  }, [mainSession]);
  const selected = selection?.session === mainSession ? pages.findIndex(page => page.id === selection.id) : -1;
  const index = selected >= 0 ? selected : pages.length - 1;
  const page = pages[index];
  const canAdvance = index === pages.length - 1 && Boolean(view.reading);
  const navigate = React.useCallback(type => {
    if (!mainSession) return false;
    if (type === 'reading.next' && canAdvance) return mainSession.advance();
    const next = type === 'reading.previous' ? index - 1 : type === 'reading.latest' ? pages.length - 1 : index + 1;
    if (next < 0 || next >= pages.length || next === index) return false;
    setSelection(next === pages.length - 1 ? null : { session: mainSession, id: pages[next].id });
    return true;
  }, [mainSession, canAdvance, index, pages]);
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
