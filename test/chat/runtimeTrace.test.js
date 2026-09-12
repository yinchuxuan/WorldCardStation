import { createRuntimeTrace } from '../../src/renderer/trace/runtimeTrace.js';

const scope = { cardId: 'card', sessionId: 'first' };
const message = { role: 'user', content: 'before' };

function setup() {
  let sequence = 0;
  const writes = [];
  const service = {
    start: jest.fn(async active => ({ token: String(++sequence), path: `${active.cardId}/${active.sessionId}/trace.jsonl` })),
    append: jest.fn(async (token, records) => { writes.push({ token, records }); }),
    close: jest.fn(async () => {})
  };
  return { service, writes, trace: createRuntimeTrace(service) };
}

test('off by default, enabling starts at current memory snapshot and disabling keeps the path', async () => {
  const { service, trace, writes } = setup();
  await trace.bind(scope, [message], {});
  expect(trace.capture().begin('pre_send', { messages: [], state: {} })).toBeUndefined();
  expect(service.start).not.toHaveBeenCalled();
  trace.update([message], { score: 4 });
  await trace.enable(true);
  expect(service.start).toHaveBeenCalledWith(scope, { messages: [message], state: { score: 4 } });
  const operation = trace.capture().begin('pre_send', { messages: [message], state: { score: 4 } });
  operation.observe('action.end', {}, [message], { score: 5 });
  operation.end({ messages: [message], state: { score: 5 } });
  await trace.enable(false);
  operation.observe('late', {}, [], {});
  await trace.flush();
  expect(writes.flatMap(write => write.records).map(event => event.type))
    .toEqual(['operation.start', 'action.end', 'operation.end', 'capture.end']);
  expect(trace.getSnapshot()).toMatchObject({ enabled: false, path: 'card/first/trace.jsonl', error: null });
});

test('queued writes retain origin across session/card switches and stale jobs cannot create new operations', async () => {
  const { trace, writes, service } = setup();
  await trace.bind(scope, [], {});
  await trace.enable(true);
  const original = trace.capture();
  const operation = original.begin('pre_send', { messages: [], state: {} });
  operation.observe('action.start', {});
  await trace.bind({ cardId: 'other', sessionId: 'second' }, [], {});
  operation.observe('late_output', {}, [message], {});
  expect(original.begin('after_response', { messages: [], state: {} })).toBeNull();
  const next = trace.capture().begin('init', { messages: [], state: {} });
  next.end({ messages: [message], state: {} });
  await trace.flush();
  expect(writes.filter(write => write.token === '1').flatMap(write => write.records).map(event => event.type))
    .toEqual(['operation.start', 'action.start', 'capture.end']);
  expect(writes[0].records[0].kind).toBe('pre_send');
  expect(writes.flatMap(write => write.records).find(event => event.type === 'capture.end'))
    .toMatchObject({ status: 'incomplete', unfinishedOperations: ['1:1'] });
  expect(service.close).toHaveBeenCalledWith('1');
});

test('write failure reports incomplete, stops claiming success and can be explicitly restarted', async () => {
  const { trace, service } = setup();
  await trace.bind(scope, [], {});
  await trace.enable(true);
  service.append.mockRejectedValueOnce(Error('disk full'));
  trace.capture().begin('init', { messages: [], state: {} }).end({ messages: [message], state: {} });
  await trace.flush();
  expect(trace.getSnapshot().error).toContain('运行日志不完整：disk full');
  expect(trace.capture().begin('pre_send', { messages: [], state: {} })).toBeNull();
  await trace.enable(false);
  await trace.enable(true);
  expect(service.start).toHaveBeenCalledTimes(2);
  expect(trace.getSnapshot().error).toBeNull();
});

test('normal chat and disabled mode never create a native trace', async () => {
  const { trace, service } = setup();
  await trace.bind(null, [], {});
  await trace.enable(true);
  trace.update([message], {});
  expect(service.start).not.toHaveBeenCalled();
  await trace.enable(false);
  await trace.bind(scope, [], {});
  expect(service.start).not.toHaveBeenCalled();
});

test('late recorder snapshots cannot change initial persisted data', async () => {
  const { trace, writes } = setup();
  await trace.bind(scope, [], {});
  await trace.enable(true);
  const snapshot = { messages: [{ ...message }], state: {} };
  const operation = trace.capture().begin('init', snapshot);
  snapshot.messages[0].content = 'later';
  operation.end(snapshot);
  await trace.flush();
  expect(writes.flatMap(write => write.records)[0].snapshot.messages[0].content).toBe('before');
});
