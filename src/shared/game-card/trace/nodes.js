function record(options, type, details, messages, state) {
  options.observer?.(type, { pointer: options.pointer, ...details }, messages, state);
}

function observeNode(type, messages, state, options, details, execute) {
  if (!options.observer) return execute();
  const started = Date.now();
  record(options, `${type}.start`, details, messages, state);
  const finish = result => {
    record(options, `${type}.end`, { ...details, status: result.trace?.reason ? 'skipped' : 'completed',
      durationMs: Date.now() - started, result: result.trace }, result.messages, result.state ?? state);
    return result;
  };
  const fail = error => {
    record(options, `${type}.error`, { ...details, status: 'failed', durationMs: Date.now() - started,
      error: { code: /timed out/i.test(error.message) ? 'SCRIPT_TIMEOUT' : 'RUNTIME_ERROR',
        message: error.message, stack: error.stack } });
    throw error;
  };
  try {
    const result = execute();
    return result && typeof result.then === 'function' ? result.then(finish, fail) : finish(result);
  } catch (error) { return fail(error); }
}

function conditionObserver(options, field = 'when') {
  if (!options.observer) return undefined;
  return detail => record(options, 'condition', { ...detail, evaluationPath: detail.path,
    pointer: `${options.pointer || ''}/${field}${(detail.path || '').replace(/\/messages\/\d+/g, '')}` });
}

export { conditionObserver, observeNode, record };
