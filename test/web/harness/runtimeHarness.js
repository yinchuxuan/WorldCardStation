import { sendChatRequest, readSSEStream } from '../../../src/renderer/chat/apiClient.js';
import { controlledScriptExecutor } from '../../../src/renderer/platform/controlledScriptExecutor.js';
import { modelFetch } from '../../../src/web/modelFetch.js';
import { createWebConfig } from '../../../src/web/config.js';
import { createWebBackground } from '../../../src/web/background.js';
import { loadCatalog } from '../../../src/web/catalog.js';
import { createHostedCards } from '../../../src/web/hostedCards.js';
import { pipelineScenario } from '../pipelineScenario.js';

const endpoint = `http://127.0.0.1:${Number(location.port) + 1}`;
async function model(protocol, mode = '') {
  let content = '';
  try {
    await sendChatRequest({ protocol, apiUrl: `${endpoint}/${mode}`, apiKey: 'test-only', modelName: 'test',
      messages: [{ role: 'user', content: 'hi' }] }, { onToken: value => { content += value; } });
    return { content };
  } catch (error) { return { error: error.message }; }
}
async function worker() {
  const context = { messages: [], state: { count: 2 }, config: {}, event: {}, args: {} };
  const result = await controlledScriptExecutor.run('return { state: { count: state.count + 1 }, messages };', context);
  let timeout;
  try { await controlledScriptExecutor.run('while(true) {}', context, { timeoutMs: 50 }); }
  catch (error) { timeout = error.message; }
  return { result, timeout };
}
async function networkLifecycle() {
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
  const url = `${endpoint}/slow/v1/chat/completions`;
  const response = await modelFetch(url, options, { timeoutMs: 100 });
  let timeout;
  try { await readSSEStream(response.body.getReader(), 'openai', {}); } catch (error) { timeout = error.message; }
  const controller = new AbortController();
  const cancelResponse = await modelFetch(url, { ...options, signal: controller.signal });
  controller.abort();
  let canceled;
  try { await readSSEStream(cancelResponse.body.getReader(), 'openai', {}); } catch (error) { canceled = error.name; }
  return { timeout, canceled };
}
async function settings() {
  const first = createWebConfig();
  await first.save({ apiKey: 'persisted', modelName: 'test' });
  const persisted = await createWebConfig().load();
  await first.save({ apiKey: '', modelName: 'test' });
  const removed = await createWebConfig().load();
  const background = createWebBackground();
  const [entry] = await loadCatalog(new URL('/cards/', location.href));
  const blob = await (await fetch(entry.coverUrl)).blob();
  // Use an actual image served by the publisher, not a fake storage object.
  const firstImage = await background.setImage(blob);
  const restored = createWebBackground();
  const secondImage = await restored.load();
  const readable = (await fetch(secondImage.backgroundImageUrl)).ok;
  await background.save({ backgroundImageUrl: '', backgroundOpacity: 0.3 });
  let revoked = false;
  try { await fetch(firstImage.backgroundImageUrl); } catch { revoked = true; }
  restored.dispose(); background.dispose();
  return { persisted, removed, readable, revoked };
}
async function parity() {
  const source = new URL('/cards/', location.href);
  const [entry] = await loadCatalog(source);
  const cards = createHostedCards({ source: source.href });
  await cards.prepare(entry);
  try {
    const actual = await pipelineScenario({ resources: cards.resources, repository: cards.repository,
      scriptExecutor: controlledScriptExecutor });
    const expected = await (await fetch('/__pipeline')).json();
    return { actual, expected };
  } finally { cards.release(); }
}
window.runtimeHarness = { model, worker, networkLifecycle, settings, parity };
