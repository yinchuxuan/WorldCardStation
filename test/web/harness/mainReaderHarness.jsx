import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserMainSession } from '../../../src/renderer/platform/mainWorkerFactory.mjs';
import { createAgentTransport } from '../../../src/renderer/chat/agentTransport.js';
import { hostedCards } from '../../../src/web/hostedCards.js';
import { loadCatalog } from '../../../src/web/catalog.js';
import useGameCardPresentation from '../../../src/renderer/chat/useGameCardPresentation.js';
import useMainPresentation from '../../../src/renderer/chat/useMainPresentation.js';
import useMainReading from '../../../src/renderer/chat/useMainReading.js';
import MainMessages from '../../../src/renderer/chat/MainMessages.jsx';
import GameCardBackgroundRuntime from '../../../src/renderer/components/GameCardBackgroundRuntime.js';
import GameCardBgmPlayer from '../../../src/renderer/components/GameCardBgmPlayer.jsx';
import AgentHistoryTitle from '../../../src/renderer/components/AgentHistoryTitle.jsx';
import ChatPanelRenderers from '../../../src/renderer/components/ChatPanelRenderers.jsx';

let session, root, card, output, base;
function Harness() {
  const stage = useGameCardPresentation();
  const [, setState] = React.useState({});
  const [background, setBackground] = React.useState({});
  const [portrait, setPortrait] = React.useState({ portraits: [] });
  const [agent, setAgent] = React.useState('judge');
  const surface = React.useRef();
  const view = useMainPresentation({ mainSession: session, card, presentation: stage, setGameState: setState });
  const reading = useMainReading(session, view, surface, false);
  return <section ref={surface}>
    <button onClick={() => { output = null; session.send('go').then(result => { output = { result }; }, error => { output = { errorMessage: error.message }; }); }}>Start reader</button>
    <button onClick={() => { output = null; session.send('fail').then(result => { output = { result }; }, error => { output = { errorMessage: error.message }; }); }}>Fail reader</button>
    <button onClick={() => reading.navigate('reading.next')}>Next reader</button>
    <button onClick={() => reading.navigate('reading.previous')}>Previous reader</button>
    <GameCardBackgroundRuntime backgroundRequest={stage.backgroundRequest} portraitRequest={stage.portraitRequest}
      onBackgroundChange={setBackground} onPortraitChange={setPortrait} />
    {background.url ? <img alt="reader background" src={background.url} /> : null}
    {portrait.portraits.map(item => <img key={item.character} alt="reader portrait" src={item.url} />)}
    <GameCardBgmPlayer updateRequest={stage.bgmRequest} stopToken={stage.bgmStopToken} />
    <MainMessages messages={view.records} reading={reading} display={card.display} isLoading={session.running} handleRetry={() => {}} />
    <AgentHistoryTitle contexts={view.contexts} selected={agent} onSelect={setAgent} />
    {ChatPanelRenderers.renderMsgHistoryDisplay(view.contexts[agent]?.messages)}
    <pre data-testid="reader-state">{JSON.stringify({ state: view.state, reading: view.reading, records: view.records })}</pre>
  </section>;
}
async function init() {
  await dispose();
  base = document.createElement('base'); base.href = `${location.origin}/`; document.head.append(base);
  const [entry] = await loadCatalog(new URL('/cards/', location.href));
  const prepared = await hostedCards.prepare(entry);
  card = { ...prepared.card, display: { segmentedReading: true } };
  const definition = { card, stateSchema: {
    'visual.scene': { type: 'enum', values: ['room', 'outside'], default: 'room', llmWrite: true },
    'visual.portraits': { type: 'object', default: {}, llmWrite: true },
    'audio.bgm': { type: 'enum', values: ['none', 'theme'], default: 'none', llmWrite: true }
  }, main: { path: 'main.js', source: `export async function onInput(ctx, input) {
    await ctx.agents.call('judge').done();
    const call = ctx.agents.call('narrator');
    await ctx.present(ctx.createReader({source:call.response,mode:'segmented'}));
    await call.done(); if (input === 'fail') throw new Error('reader rollback');
  }` }, agents: Object.fromEntries(['judge', 'narrator'].map(id => [id, { definition: { model: id, rules: [] } }])) };
  session = createBrowserMainSession({ definition, generate: createAgentTransport(async id => ({ protocol: 'openai',
    apiUrl: `http://127.0.0.1:${Number(location.port) + 1}/${id === 'judge' ? 'reader-judge' : 'reader'}`,
    apiKey: 'test-only', modelName: 'test' })) });
  const node = document.createElement('div'); node.id = 'reader-harness'; document.body.append(node);
  root = createRoot(node); root.render(<Harness />);
  return true;
}
async function dispose() {
  root?.unmount(); root = undefined;
  await session?.dispose(); session = undefined;
  document.getElementById('reader-harness')?.remove(); base?.remove();
  hostedCards.release();
}
window.mainReaderHarness = { init, dispose, snapshot: () => session.snapshot(), view: () => session.view(), result: () => output };
const setupButton = document.createElement('button');
setupButton.textContent = 'Initialize reader test';
setupButton.onclick = () => { init().catch(error => { setupButton.textContent = error.message; }); };
document.body.append(setupButton);
