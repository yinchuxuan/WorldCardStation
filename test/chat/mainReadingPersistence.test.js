import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMainSession } from '../../src/renderer/gameCard/mainSession.js';
import useMainReading from '../../src/renderer/chat/useMainReading.js';
import MainMessages from '../../src/renderer/chat/MainMessages.jsx';

const definition = { card: { id: 'reading-save', version: '1' }, stateSchema: {},
  agents: { narrator: { definition: { model: 'default', rules: [] } } } };
function Reading({ session }) {
  const surface = React.useRef();
  const reading = useMainReading(session, session.view(), surface, false);
  return <div ref={surface} onClick={reading.advanceVisiblePage}>
    <MainMessages messages={session.view().messages} reading={reading} isLoading={false} handleRetry={() => {}} />
  </div>;
}

test.each(['opening', 'reply'])('%s restores and re-saves its visible position without replaying Agent initialization', async origin => {
  const first = createMainSession({ definition });
  const record = { id: 'visible-round-1-1', role: 'assistant', mode: 'segmented', content: '第一段。\n\n第二段。\n\n第三段。',
    units: ['第一段。', '第二段。', '第三段。'].map(text => ({ text, patches: [] })) };
  const snapshot = first.snapshot();
  first.restoreHistory({ runtimeSession: { version: 1, cardId: definition.card.id, cardVersion: '1', sequence: 1,
    started: true, retryBase: null, current: { ...snapshot, records: [record], messages: [record],
      contexts: { narrator: { initialized: true, messages: [
        { id: 'msg-round-1-1', role: 'assistant', content: origin, ttl: -1 }
      ] } } }, viewState: { reading: { messageId: record.id, segmentIndex: 1 } } } });
  const rendered = render(<Reading session={first} />);
  expect(screen.getByText('第二段。')).toBeInTheDocument();
  expect(screen.queryByText('第一段。')).toBeNull();
  fireEvent.click(screen.getByText('第二段。'));
  expect(screen.getByText('第三段。')).toBeInTheDocument();
  const saved = first.exportSession();
  expect(saved.viewState.reading).toEqual({ messageId: record.id, segmentIndex: 2 });
  rendered.unmount();
  const restored = createMainSession({ definition });
  try {
    restored.restoreHistory({ runtimeSession: saved });
    await restored.start(); // A restored started Session must not launch a Worker or replay init/onStart.
    render(<Reading session={restored} />);
    expect(screen.getByText('第三段。')).toBeInTheDocument();
    expect(screen.queryByText('第二段。')).toBeNull();
    expect(restored.snapshot().contexts.narrator.messages).toEqual(saved.current.contexts.narrator.messages);
  } finally { await first.dispose(); await restored.dispose(); }
});
