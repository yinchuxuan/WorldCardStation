import React from 'react';

export function useGameCardImport(onImport) {
  const [request, setRequest] = React.useState(null);
  const [cancelable, setCancelable] = React.useState(false);
  const operation = React.useRef(null);
  const resolver = React.useRef(null);
  const finish = accepted => {
    resolver.current?.(accepted);
    resolver.current = null;
    setRequest(null);
  };
  const cancel = () => { operation.current?.abort(); finish(false); setCancelable(false); };
  React.useEffect(() => () => { operation.current?.abort(); resolver.current?.(false); }, []);
  const run = async (targetCard, onProgress) => {
    const controller = new AbortController();
    operation.current = controller;
    try {
      return await onImport(next => new Promise(resolve => {
        resolver.current = resolve;
        setRequest(next);
      }), {
        targetCard, signal: controller.signal,
        onProgress: (message, canCancel = true) => { setCancelable(canCancel); onProgress(message); }
      });
    } catch (error) {
      if (controller.signal.aborted) return null;
      throw error;
    } finally {
      operation.current = null;
      setCancelable(false);
    }
  };
  return { request, finish, run, cancel, cancelable };
}
