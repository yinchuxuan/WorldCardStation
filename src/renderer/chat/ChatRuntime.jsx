import React from 'react';
import ChatMessages from './ChatMessages.jsx';
import { PropTypes } from '../components/componentPropTypes.js';
import ChatInputArea from '../ChatInputArea.jsx';
import ChatHeader from '../components/ChatHeader.jsx';
import ChatPanelRenderers from '../components/ChatPanelRenderers.jsx';
import GameCardBackgroundRuntime from '../components/GameCardBackgroundRuntime.js';
import GameCardBgmPlayer from '../components/GameCardBgmPlayer.jsx';
import GameCardErrorPanel from '../components/GameCardErrorPanel.jsx';
import GameCardStyleHost from '../components/GameCardStyleHost.jsx';
import GameCardTitleControl from '../components/GameCardTitleControl.jsx';
import GameCardUIRoot from '../components/GameCardUIRoot.jsx';
import PlatformRequestErrorNotice from '../components/PlatformRequestErrorNotice.jsx';
import PlatformResponseWarningNotice from '../components/PlatformResponseWarningNotice.jsx';
import useLastUserMessageEdit from './useLastUserMessageEdit.js';
import useSegmentedReading from './useSegmentedReading.js';
import useTypewriter from './useTypewriter.js';
import { rendererServices, savePolicy } from '../platform/index.js';
import { useGameCardRuntime } from './GameCardRuntimeProvider.jsx';
import useAppClosePersistence from './useAppClosePersistence.js';
import useChatGeneration from './useChatGeneration.js';
import useChatPresentationHandlers from './useChatPresentationHandlers.js';
import useChatPersistence from './useChatPersistence.js';
import useChatScroll from './useChatScroll.js';
import useChatSession from './useChatSession.js';
import useGameCardSwitching from './useGameCardSwitching.js';
import useGameCardPresentation from './useGameCardPresentation.js';
import useModelConfig from './useModelConfig.js';
import useReadingStatePatches from './useReadingStatePatches.js';
import useChatDisplay from './useChatDisplay.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';
function ChatRuntime({
  BgmPlayer = GameCardBgmPlayer,
  BackgroundRuntime = GameCardBackgroundRuntime,
  onBackgroundChange,
  onPortraitChange,
  onVisualPanelChange
}) {
  const [messages, setMessages] = React.useState([]), [isLoading, setIsLoading] = React.useState(false);
  const [showMsgHistory, setShowMsgHistory] = React.useState(false);
  const [msgHistoryMessages, setMsgHistoryMessages] = React.useState(null);
  const [showStreamThinking, setShowStreamThinking] = React.useState(true);
  const [isInputHovered, setIsInputHovered] = React.useState(false);
  const [isInputTriggerHovered, setIsInputTriggerHovered] = React.useState(false);
  const [actionError, setActionError] = React.useState(null), [requestError, setRequestError] = React.useState(null), [responseWarning, setResponseWarning] = React.useState(null);
  const chatPanelRef = React.useRef(null);
  const runtime = useGameCardRuntime();
  React.useEffect(() => runtimeTrace.update(messages, runtime.gameState), [messages, runtime.gameState]);
  const { display, displayRevision, depths } = useChatDisplay(runtime.activeCard?.display, runtime.gameState, messages, isLoading);
  const segmentedReading = display?.segmentedReading === true;
  const modelConfig = useModelConfig();
  const typewriter = useTypewriter();
  const presentation = useGameCardPresentation();
  const persistence = useChatPersistence({ messages, gameState: runtime.gameState, isLoading });
  const presentationHandlers = useChatPresentationHandlers(runtime.activeCard, presentation);
  const generation = useChatGeneration({
    messages, setMessages, gameState: runtime.gameState, setGameState: runtime.setGameState,
    modelConfig, typewriter,
    persistence, isLoading,
    setIsLoading, setRuntimeError: runtime.setRuntimeError,
    setRequestError,
    setShowStreamThinking,
    onAudioSubmit: presentation.stopBgm,
    onRetryStateRestore: presentationHandlers.onRetryStateRestore, onRequestFailureRestore: presentationHandlers.onRequestFailureRestore,
    onValidationRetry: presentationHandlers.onValidationRetry,
    onResponseValidationWarning: setResponseWarning,
    onPresentationEffects: presentation.applyEffects,
    onStatePatchApplied: presentationHandlers.onStatePatchApplied,
    onStreamContentStart: presentationHandlers.onStreamContentStart
  });
  useAppClosePersistence({ stopGeneration: generation.stop, flush: persistence.flush });
  const scroll = useChatScroll({ messages, isLoading, displayedCount: typewriter.displayedCount, showMsgHistory });
  const session = useChatSession({
    setMessages,
    setGameState: runtime.setGameState,
    setRuntimeError: runtime.setRuntimeError,
    isLoading,
    setIsLoading,
    persistence,
    typewriter,
    onResetView: scroll.collapseHistory,
    onSessionLoaded: presentationHandlers.onSessionLoaded
  });
  const gameCards = useGameCardSwitching({ isLoading, setIsLoading, presentation, runtime, session });
  React.useEffect(() => { setRequestError(null); setResponseWarning(null); }, [session.revision]);
  const editUserMessage = useLastUserMessageEdit({ messages, isLoading,
    retryBaseMessages: persistence.retryBaseRef.current });
  const handleReadProgress = useReadingStatePatches({
    card: runtime.activeCard,
    messages,
    setMessages,
    state: runtime.gameState,
    setState: runtime.setGameState,
    typewriter,
    scopeKey: session.revision,
    onPatchApplied: presentationHandlers.onStatePatchApplied,
    onPresentationEffects: presentation.applyEffects,
    onError: runtime.setRuntimeError,
    beginOperation: persistence.manual.beginOperation
  });
  const segmented = useSegmentedReading({
    enabled: segmentedReading,
    isLoading, messages,
    streamContent: typewriter.streamContent,
    rawStreamContent: typewriter.rawStreamContent,
    streamMessageId: typewriter.streamMessageId,
    displayedCount: typewriter.displayedCount,
    display,
    scopeKey: session.revision,
    surfaceRef: chatPanelRef, onReadProgress: handleReadProgress,
    restorePosition: persistence.readingPosition, restoreToken: persistence.readingRestoreToken,
    onPositionChange: persistence.setReadingPosition
  });
  const handleRetry = React.useCallback(async (content) => {
    const retryContent = typeof content === 'string'
      ? content
      : (editUserMessage.isActive ? editUserMessage.content : undefined);
    const ok = await generation.retry(retryContent);
    if (ok) editUserMessage.finish();
    return ok;
  }, [editUserMessage, generation]);
  const toggleHistory = () => {
    const next = !showMsgHistory;
    setShowMsgHistory(next);
    if (next && savePolicy === 'manual') setMsgHistoryMessages(messages);
    else if (next) rendererServices.sessions.loadHistory()
      .then(result => setMsgHistoryMessages(result.messages))
      .catch(error => setActionError(error));
  };
  const toggleThinking = (index) => setMessages(prev => prev.map((msg, current) => (
    current === index ? { ...msg, _thinkingVisible: !msg._thinkingVisible } : msg
  )));
  const streamThinking = typewriter.getThinkingContent();
  const currentThinking = isLoading && streamThinking ? streamThinking : null;
  return <div className="chat-panel" data-gc-part="chat-panel"
    ref={chatPanelRef} onClick={showMsgHistory ? undefined : segmented.advanceVisiblePage}>
    <PlatformRequestErrorNotice error={requestError} onClose={() => setRequestError(null)} />
    <PlatformResponseWarningNotice warning={responseWarning} onClose={() => setResponseWarning(null)} />
    <GameCardStyleHost card={runtime.activeCard} />
    <BackgroundRuntime backgroundRequest={presentation.backgroundRequest} portraitRequest={presentation.portraitRequest} onBackgroundChange={onBackgroundChange} onPortraitChange={onPortraitChange} onVisualPanelChange={onVisualPanelChange} />
    <GameCardUIRoot card={runtime.activeCard} gameState={runtime.gameState}
      setGameState={runtime.setGameState} messages={messages} isLoading={isLoading}
      canRetry={Boolean(editUserMessage.retrySource && modelConfig?.apiUrl && modelConfig?.apiKey)}
      retrySource={editUserMessage.retrySource} onRetry={handleRetry}
      reading={segmented.ui} onReadingNavigate={segmented.navigate}
      uiScopeKey={session.revision} onError={runtime.setRuntimeError}
      beginOperation={persistence.manual.beginOperation} canMutate={persistence.manual.canMutate} />
    <div className="chat-main" data-gc-part="chat-main">
      <ChatHeader onToggleHistory={toggleHistory}>
        {showMsgHistory ? <span className="header-title">msg历史记录</span> : <GameCardTitleControl
          modelName={modelConfig?.apiUrl ? (modelConfig.modelName || '已连接') : ''} isLoading={isLoading}
          onBeforeSessionChange={session.beforeLeave}
          saveControl={persistence.manual}
          onSessionChanged={session.reload}
          onSwitchSession={session.switchSession}
          onActivateCard={gameCards.activate}
          onImportCard={gameCards.importCard} onUninstallCard={gameCards.uninstallCard}
          onImportError={setActionError}
          audioControl={<BgmPlayer updateRequest={presentation.bgmRequest} stopToken={presentation.bgmStopToken} />}
        />}
      </ChatHeader>
      {actionError ? <GameCardErrorPanel error={actionError} variant="import" onClose={() => setActionError(null)} /> : null}
      <div className="chat-history" data-gc-part="chat-history" data-view={showMsgHistory ? 'history' : 'messages'} ref={scroll.chatHistoryRef}>
        <div className="chat-reading-veil game-card-visual-panel" data-gc-part="chat-reading-veil" aria-hidden="true" />
        {runtime.runtimeError ? <GameCardErrorPanel error={runtime.runtimeError} /> : null}
        {showMsgHistory ? ChatPanelRenderers.renderMsgHistoryDisplay(msgHistoryMessages) : <ChatMessages
          display={display} displayRevision={displayRevision} depths={depths}
          segmentedReading={segmentedReading} segmented={segmented} typewriter={typewriter}
          currentThinking={currentThinking} showStreamThinking={showStreamThinking}
          setShowStreamThinking={setShowStreamThinking} toggleThinking={toggleThinking}
          handleRetry={handleRetry} scroll={scroll} modelConfig={modelConfig} editUserMessage={editUserMessage} />}
      </div>
      <div className="chat-input-hover-trigger" data-gc-part="chat-input-trigger" onMouseEnter={() => setIsInputTriggerHovered(true)} onMouseLeave={() => setIsInputTriggerHovered(false)} />
    </div>
    <ChatInputArea isLoading={isLoading} isInputHovered={isInputHovered} setIsInputHovered={setIsInputHovered} isInputTriggerHovered={isInputTriggerHovered} setIsInputTriggerHovered={setIsInputTriggerHovered} onSend={generation.send} onStop={generation.stop} />
  </div>;
}
ChatRuntime.propTypes = {
  BgmPlayer: PropTypes.elementType,
  BackgroundRuntime: PropTypes.elementType,
  onBackgroundChange: PropTypes.func,
  onPortraitChange: PropTypes.func,
  onVisualPanelChange: PropTypes.func
};
export default ChatRuntime;
