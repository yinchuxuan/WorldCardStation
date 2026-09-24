import { createMainSession } from '../../src/renderer/gameCard/mainSession.js';
import { barrier } from './agentRuntimeHelpers.js';

function sessionOptions(overrides = {}) {
  return { definition: { card: {}, main: { path: 'main.js', source: 'export async function onInput() {}' },
    stateSchema: { count: { type: 'number', default: 0 } }, agents: { judge: { definition: { model: 'default', rules: [] } } } },
  workerFactory: () => { throw new Error('should not start'); }, ...overrides };
}

test('cancel during module loading cannot start a late Worker', async () => {
  const gate = barrier();
  const options = sessionOptions({ readText: () => gate.promise });
  options.definition.main.source = 'import "./lib.js"; export async function onInput() {}';
  options.workerFactory = jest.fn();
  const session = createMainSession(options);
  const result = session.send('go');
  await Promise.resolve();
  await session.cancel();
  await expect(result).rejects.toThrow('cancelled');
  gate.resolve('export const x = 1;');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(options.workerFactory).not.toHaveBeenCalled();
  await session.dispose();
  await expect(session.send('old')).rejects.toThrow('disposed');
});

test('publishes only complete snapshots and retries from the pre-input baseline', async () => {
  const workerFactory = () => {
    const worker = { terminate: jest.fn(), postMessage: data => {
      if (data.type === 'start') queueMicrotask(() => worker.onmessage({ data: { type: 'complete', result: {
        ...data.snapshot, state: data.startup ? data.snapshot.state : { count: data.snapshot.state.count + 1, input: data.input }
      } } }));
    } };
    return worker;
  };
  const session = createMainSession(sessionOptions({ workerFactory }));
  const waiting = [];
  session.subscribe((view, detail) => {
    if (detail.type === 'start') waiting.push(view.pendingInput);
    if (detail.type === 'complete') expect(view.pendingInput).toBeNull();
  });
  await session.start();
  await expect(session.retry()).rejects.toThrow('no input');
  await expect(session.send({})).rejects.toThrow('string');
  const active = session.send('one');
  expect(session.running).toBe(true);
  expect(session.snapshot().state.count).toBe(0);
  const result = await active;
  expect(Object.isFrozen(result.state)).toBe(true);
  await session.send('two');
  expect(session.snapshot().state.count).toBe(2);
  await session.retry('edit');
  expect(session.snapshot().state).toEqual({ count: 2, input: 'edit' });
  expect(waiting).toEqual([null, 'one', 'two', 'edit']);
  expect(session.snapshot()).not.toHaveProperty('pendingInput');
});
