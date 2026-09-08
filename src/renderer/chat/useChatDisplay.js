import React from 'react';
import { resolveDisplayState } from '../gameCard/regexTemplate.js';
import { messageDepths } from '../gameCard/messageDepth.js';

export default function useChatDisplay(config, state, messages, isLoading) {
  const display = React.useMemo(() => resolveDisplayState(config, state), [config, state]);
  const displayRevision = React.useMemo(() => JSON.stringify(display ?? null), [display]);
  const depths = React.useMemo(() => messageDepths(messages, isLoading), [messages, isLoading]);
  return { display, displayRevision, depths };
}
