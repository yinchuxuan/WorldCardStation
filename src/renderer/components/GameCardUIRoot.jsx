import DOMPurify from 'dompurify';
import { marked } from 'marked';
import React from 'react';
import ChatPanelMessageRenderers from './ChatPanelMessageRenderers.jsx';
import { highlightQuotes } from './highlightQuotes.js';
import * as runtime from '../gameCard/uiRuntime.js';
import { gameCardPlatform } from '../platform/index.js';
import { dispatchChatInputCommand } from '../chat/chatInputCommands.js';
import GameCardUIErrorBoundary from './GameCardUIErrorBoundary.jsx';
import { readonly } from '../gameCard/uiReadonly.js';
import { resolveDisplayState } from '../gameCard/regexTemplate.js';
import useUiStateEventQueue from '../gameCard/useUiStateEventQueue.js';
import { gameCard, gameState, message, PropTypes } from './componentPropTypes.js';

async function resourceResult(field, load) {
  try {
    const value = await load();
    return { success: true, [field]: value };
  } catch (error) {
    return { success: false, [field]: '', error: error.message };
  }
}

const inputEventTypes = new Set([
  'chat.input.set', 'chat.input.append', 'chat.input.clear',
  'chat.input.focus', 'chat.input.submit', 'chat.send'
]);
const readingEventTypes = new Set([
  'reading.previous', 'reading.next', 'reading.latest'
]);

function renderAssistantMessage(R, content, card, options = {}, state) {
  const renderers = ChatPanelMessageRenderers;
  const rowClass = ['chat-message-row', options.rowClassName].filter(Boolean).join(' ');
  const msgClass = ['chat-message assistant', options.messageClassName].filter(Boolean).join(' ');
  const bubble = renderers.renderAssistantMsg({ msg: { role: 'assistant', content: String(content || '') }, idx: 0, isStreaming: false, tw: null,
      currentThinking: '', showStreamThinking: false, setShowStreamThinking: () => {},
      toggleThinkingForMessage: () => {}, marked, DOMPurify, highlightQuotes,
      display: resolveDisplayState(card?.display, state), displayRevision: undefined, segmentedReading: undefined,
      depth: options.depth ?? 0 });
  return R.createElement('div', { className: rowClass, 'data-gc-part': 'message-row', 'data-role': 'assistant' },
    R.createElement('div', { className: msgClass, 'data-gc-part': 'message', style: { flex: 1, minWidth: 0 } }, bubble)
  );
}

function GameCardUIRootContent({
  card,
  gameState = {},
  setGameState,
  messages = [],
  isLoading = false,
  canRetry = false,
  retrySource = '',
  onRetry,
  reading = {},
  onReadingNavigate,
  onError
}) {
  const R = React;
  const [loadedRoot, setLoadedRoot] = R.useState(null);
  const [error, setError] = R.useState(null);
  const cardId = card?.id || '';
  const rootSource = card?.ui?.root?.source || '';
  const C = R.createElement;

  const emitStateEvent = useUiStateEventQueue({
    card, gameState, messages, setGameState, onError: setError
  });

  R.useEffect(() => {
    let canceled = false;
    setLoadedRoot(null);
    setError(null);
    async function loadRoot() {
      if (!runtime) return;
      try {
        const root = await runtime.loadGameCardUiRoot(card, gameCardPlatform.resources, R);
        if (!canceled) setLoadedRoot(root);
      } catch (err) {
        if (!canceled) {
          setError(err);
          onError?.(err);
        }
      }
    }
    loadRoot();
    return () => {
      canceled = true;
    };
  }, [cardId, rootSource]);

  const safeState = R.useMemo(() => readonly(gameState || {}), [gameState]);
  const safeMessages = R.useMemo(() => readonly(messages || []), [messages]);
  const emit = R.useCallback((event) => {
    try {
      if (inputEventTypes.has(event?.type)) return dispatchChatInputCommand(event);
      if (event?.type === 'chat.retry') {
        if (event.content !== undefined && typeof event.content !== 'string') {
          throw Error('chat.retry content must be a string');
        }
        return onRetry?.(event.content) ?? false;
      }
      if (readingEventTypes.has(event?.type)) {
        return onReadingNavigate?.(event.type) ?? false;
      }
      return emitStateEvent(event);
    } catch (err) {
      setError(err);
      return false;
    }
  }, [emitStateEvent, onReadingNavigate, onRetry]);
  const assets = R.useMemo(() => ({
    readFile: (filePath) => resourceResult('content', () => gameCardPlatform.resources.readText(cardId, filePath)),
    getBackgroundUrl: (key) => card?.visual?.background?.[key]
      ? resourceResult('url', () => gameCardPlatform.resources.getImageUrl(cardId, card.visual.background[key]))
      : Promise.resolve({ success: false }),
    getImageUrl: (filePath) => resourceResult('url', () => gameCardPlatform.resources.getImageUrl(cardId, filePath)),
    getAudioUrl: (filePath) => resourceResult('url', () => gameCardPlatform.resources.getAudioUrl(cardId, filePath))
  }), [cardId, card]);
  const ui = R.useMemo(() => ({
    cardId,
    isLoading,
    canRetry,
    retrySource,
    reading,
    root: card?.ui?.root || {},
    renderAssistantMessage: (content, options) => renderAssistantMessage(R, content, card, options, gameState)
  }), [R, cardId, isLoading, canRetry, retrySource, reading, card, gameState]);

  if (!loadedRoot?.Component) return null;
  return C('div', {
    id: 'game-card-ui-root',
    'data-gc-part': 'game-card-ui-root',
    'data-error': error ? String(error.message || error) : undefined,
    style: { position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none' }
  }, C(loadedRoot.Component, {
    React: R,
    state: safeState,
    messages: safeMessages,
    ui,
    props: loadedRoot.props || {},
    assets,
    emit
  }));
}

function GameCardUIRoot(props) {
  const root = props.card?.ui?.root;
  if (!root?.source) return null;
  const resetKey = `${props.card?.id || ''}:${root?.source || ''}:${root?.style || ''}:${props.uiScopeKey || 0}`;
  return <GameCardUIErrorBoundary key={resetKey} onError={props.onError}>
    <GameCardUIRootContent {...props} />
  </GameCardUIErrorBoundary>;
}

const gameCardUIRootPropTypes = {
  card: gameCard,
  gameState,
  setGameState: PropTypes.func,
  messages: PropTypes.arrayOf(message),
  isLoading: PropTypes.bool,
  canRetry: PropTypes.bool,
  retrySource: PropTypes.string,
  onRetry: PropTypes.func,
  reading: PropTypes.shape({
    enabled: PropTypes.bool,
    canPrevious: PropTypes.bool,
    canNext: PropTypes.bool,
    atLatest: PropTypes.bool,
    messageIndex: PropTypes.number,
    segmentIndex: PropTypes.number
  }),
  onReadingNavigate: PropTypes.func,
  uiScopeKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onError: PropTypes.func
};
GameCardUIRootContent.propTypes = gameCardUIRootPropTypes;
GameCardUIRoot.propTypes = gameCardUIRootPropTypes;

export default GameCardUIRoot;
