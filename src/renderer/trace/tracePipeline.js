import { runtimeTrace } from './runtimeTrace.js';

function tracePipeline(prepare, kind, platform) {
  return async (options = {}) => {
    const input = { messages: options.messages || [], state: options.state || {} };
    const operation = (options.traceContext || runtimeTrace.capture()).begin(kind, input,
      { phase: kind, ...options.traceDetails, ...(options.patchText !== undefined ? { patchText: options.patchText } : {}) });
    const observer = operation?.observe;
    try {
      const result = await prepare({ ...options, platform, observer });
      observer?.('pipeline.result', { phase: kind, applied: result.applied,
        error: result.error, errors: result.trace?.errors, result: result.patchTrace || result.trace,
        reason: kind === 'init' && !result.applied ? 'history_not_empty' : undefined }, result.messages, result.state);
      operation?.end(result, result.error || result.trace?.errors?.length ? 'with_errors' : 'completed');
      return result;
    } catch (error) {
      observer?.('pipeline.error', { error: { code: 'PIPELINE_ERROR', message: error.message } });
      operation?.end(input, 'failed');
      throw error;
    }
  };
}

export { tracePipeline };
