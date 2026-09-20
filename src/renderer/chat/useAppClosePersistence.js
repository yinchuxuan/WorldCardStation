import React from 'react';
import { rendererServices, capabilities } from '../platform/index.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';

function waitForStateCommit() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function useAppClosePersistence({
  stopGeneration,
  flush,
  windowService = rendererServices.window
}) {
  const closingRef = React.useRef(false);

  React.useEffect(() => {
    if (capabilities?.nativeClose === false) return;
    return windowService.onCloseRequested(async event => {
      event.preventDefault();
      if (closingRef.current) return;
      closingRef.current = true;
      try {
        await stopGeneration?.();
        await waitForStateCommit();
        await flush();
        await runtimeTrace.stop();
      } catch (error) {
        console.error('Failed to save chat before closing:', error);
      }
      try {
        await windowService.destroy();
      } catch (error) {
        closingRef.current = false;
        console.error('Failed to close application window:', error);
      }
    });
  }, [flush, stopGeneration, windowService]);
}

export { waitForStateCommit };
export default useAppClosePersistence;
