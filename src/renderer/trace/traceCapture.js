import { createTraceRecorder } from '../../shared/game-card/trace/changes.js';
import { cloneJson } from '../../shared/game-card/utils/jsonValue.js';

function createTraceCapture(service, session, snapshot, onFailure) {
  let active = true, failed = false, pending = [], tail = Promise.resolve(), scheduled = false;
  const operations = new Set();
  let nextOperation = 0;
  const fail = error => {
    failed = true;
    pending = [];
    onFailure(error);
  };
  const flush = () => {
    if (pending.length && !failed) {
      const records = pending;
      pending = [];
      tail = tail.then(() => failed ? undefined : service.append(session.token, records)).catch(fail);
    }
    return tail;
  };
  const write = record => {
    if (!active || failed) return;
    pending.push(record);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => { scheduled = false; void flush(); });
    }
  };
  function begin(kind, input = snapshot, details = {}) {
    if (!active || failed) return null;
    const operationId = `${session.token}:${++nextOperation}`;
    operations.add(operationId);
    write({ type: 'operation.start', operationId, kind, ...cloneJson(details), snapshot: cloneJson(input),
      time: new Date().toISOString() });
    const observe = createTraceRecorder(event => write({ ...event, operationId, kind }), input, fail);
    let complete = false;
    return {
      id: operationId,
      observe(...args) { if (!complete) observe(...args); },
      end(result, status = 'completed') {
        if (complete) return;
        complete = true;
        observe('operation.end', { status }, result?.messages, result?.state);
        operations.delete(operationId);
      }
    };
  }
  const commits = createTraceRecorder(write, snapshot, fail);
  return {
    path: session.path, begin, flush,
    commit(messages, state) { commits('platform.commit', { status: 'committed' }, messages, state); },
    async close(reason) {
      write({ type: 'capture.end', time: new Date().toISOString(), reason,
        status: operations.size ? 'incomplete' : 'completed', unfinishedOperations: [...operations] });
      active = false;
      await flush();
      try { await service.close(session.token); } catch (error) { fail(error); }
    }
  };
}

export { createTraceCapture };
