import { loadPlayerSession } from '../../src/renderer/gameCard/loadPlayerSession.js';
import { createMainSession } from '../../src/renderer/gameCard/mainSession.js';
import { buildMainWorkerFactory } from '../game-card/mainWorkerTestHost.js';
import { barrier } from '../game-card/agentRuntimeHelpers.js';

jest.mock('../../src/renderer/chat/apiClient.js', () => ({ sendChatRequest: jest.fn() }));
jest.mock('../../src/renderer/trace/runtimeTrace.js', () => ({ runtimeTrace: { capture: () => null } }));

let factory;
beforeAll(() => { factory = buildMainWorkerFactory(); });
async function create(generate, history = {}) {
  const loaded = await loadPlayerSession(null, {}, {}, options => createMainSession({ ...options, generate, workerFactory: factory }));
  loaded.session.restoreHistory(history);
  await loaded.session.start();
  return loaded.session;
}

test('built-in chat migrates history, streams literal tags and thinking, restores and retries edited input', async () => {
  const requests = [], updates = [];
  const generate = async (request, cb) => {
    requests.push(request.messages);
    cb.onThinkingToken('reasoning');
    cb.onToken('answer<state_patch>literal');
  };
  const session = await create(generate, { messages: [
    { role: 'system', content: 'rules' }, { role: 'user', content: 'old' },
    { role: 'assistant', content: 'previous', _thinking: 'old reasoning' }
  ] });
  session.subscribe((view, detail) => { if (detail.type === 'thinking') updates.push(view.thinkingPreview.text); });
  let restored;
  try {
    expect(requests).toEqual([]);
    await session.send('new');
    expect(requests[0].map(msg => msg.content)).toEqual(['rules', 'old', 'previous', 'new']);
    expect(updates).toEqual(['reasoning']);
    expect(session.snapshot().messages.at(-1).content).toBe('answer<state_patch>literal');
    const saved = session.exportSession();
    expect(saved.current.contexts.chat.messages.at(-1).thinking).toBe('reasoning');
    restored = await create(generate, { runtimeSession: saved });
    expect(requests).toHaveLength(1);
    await restored.retry('edited');
    expect(requests[1].map(msg => msg.content)).toEqual(['rules', 'old', 'previous', 'edited']);
    expect(restored.snapshot().messages.filter(msg => msg.role === 'user').map(msg => msg.content)).toEqual(['old', 'edited']);
  } finally { await session.dispose(); await restored?.dispose(); }
});

test('failure preserves preview, refuses saving and accepts retry; cancellation rejects late output', async () => {
  const reached = barrier(), release = barrier();
  let attempt = 0, signal;
  const session = await create(async (request, cb) => {
    signal = request.signal;
    cb.onToken('partial');
    if (++attempt === 1) throw new Error('provider offline');
    if (attempt === 3) { reached.resolve(); await release.promise; cb.onToken('late'); }
  });
  try {
    await expect(session.send('hello')).rejects.toThrow('provider offline');
    expect(session.view().messages.at(-1).content).toBe('partial');
    expect(() => session.exportSession()).toThrow();
    await session.retry();
    const saved = session.snapshot();
    const work = session.send('cancel');
    await reached.promise;
    await session.cancel();
    await expect(work).rejects.toThrow('cancelled');
    expect(signal.aborted).toBe(true);
    release.resolve();
    expect(session.snapshot()).toEqual(saved);
  } finally { release.resolve(); await session.dispose(); }
});

test('old retry baseline is converted without replay and malformed archives fail closed', async () => {
  const calls = [];
  const session = await create(async (req, cb) => { calls.push(req.messages); cb.onToken('new'); }, {
    messages: [{ role: 'user', content: 'old' }, { role: 'assistant', content: 'answer' }],
    retryBaseMessages: [{ role: 'user', content: 'original' }]
  });
  try {
    await session.retry();
    expect(calls[0].map(msg => msg.content)).toEqual(['original']);
    await session.beginLoad();
    expect(() => session.restoreHistory({ messages: [{ role: 'assistant', content: 42 }] })).toThrow();
    expect(() => session.exportSession()).toThrow();
  } finally { await session.dispose(); }
});
