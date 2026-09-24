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
import useChatView from './useChatView.js';
import { useGameCardRuntime } from './GameCardRuntimeProvider.jsx';
import useAppClosePersistence from './useAppClosePersistence.js';
import useMainGeneration from './useMainGeneration.js';
import useChatPersistence from './useChatPersistence.js';
import useChatScroll from './useChatScroll.js';
import useChatSession from './useChatSession.js';
import useGameCardSwitching from './useGameCardSwitching.js';
import useGameCardPresentation from './useGameCardPresentation.js';
import useModelConfig from './useModelConfig.js';
import useChatDisplay from './useChatDisplay.js';
import { runtimeTrace } from '../trace/runtimeTrace.js';
import useMainPresentation from './useMainPresentation.js';
import useMainReading from './useMainReading.js';
import MainMessages from './MainMessages.jsx';
import AgentHistoryTitle from '../components/AgentHistoryTitle.jsx';
function ChatRuntime({
  BgmPlayer = GameCardBgmPlayer,
  BackgroundRuntime = GameCardBackgroundRuntime,
  onBackgroundChange,
  onPortraitChange,
  onVisualPanelChange
}) {
  const [messages, setMessages] = React.useState([]), [isLoading, setIsLoading] = React.useState(false);
  const [showMsgHistory, setShowMsgHistory] = React.useState(false);
  const [agentSelection, setAgentSelection] = React.useState(null);
  const [isInputHovered, setIsInputHovered] = React.useState(false);
  const [isInputTriggerHovered, setIsInputTriggerHovered] = React.useState(false);
  const [actionError, setActionError] = React.useState(null), [requestError, setRequestError] = React.useState(null), [responseWarning, setResponseWarning] = React.useState(null);
  const chatPanelRef = React.useRef(null);
  const runtime = useGameCardRuntime();
  React.useEffect(() => runtimeTrace.update(messages, runtime.gameState), [messages, runtime.gameState]);
  const { display, displayRevision, depths } = useChatDisplay(runtime.activeCard?.display, runtime.gameState, messages, isLoading,
    Boolean(runtime.activeCard) && runtime.activeCard.statePatch?.enabled !== false);
  const modelConfig = useModelConfig();
  const presentation = useGameCardPresentation();
  const mainView = useMainPresentation({ mainSession: runtime.mainSession, card: runtime.activeCard, presentation,
    setGameState: runtime.setGameState, setMessages, setIsLoading });
  const chatView = useChatView(mainView, isLoading);
  const agentId = (agentSelection && agentSelection.session === runtime.mainSession && mainView.contexts[agentSelection.id])
    ? agentSelection.id : Object.keys(mainView.contexts)[0];
  const persistence = useChatPersistence({ messages, gameState: runtime.gameState, isLoading, mainSession: runtime.mainSession, enabled: Boolean(runtime.mainSession?.exportSession) });
  const mainReading = useMainReading(runtime.mainSession, mainView, chatPanelRef, showMsgHistory, persistence.notifyViewChanged, display);
  const generation = useMainGeneration({
    mainSession: runtime.mainSession,
    canMutate: persistence.manual.canQueueInput,
    setRequestError,
    onResponseValidationWarning: setResponseWarning
  });
  useAppClosePersistence({ stopGeneration: generation.stop, flush: persistence.flush });
  const scroll = useChatScroll({ messages, isLoading, displayedCount: chatView.typewriter.displayedCount, showMsgHistory });
  const session = useChatSession({
    setMessages, mainSession: runtime.mainSession, enabled: Boolean(runtime.mainSession?.restoreHistory),
    setGameState: runtime.setGameState,
    setRuntimeError: runtime.setRuntimeError,
    isLoading,
    setIsLoading,
    persistence,
    onResetView: scroll.collapseHistory
  });
  const gameCards = useGameCardSwitching({ isLoading, setIsLoading, presentation, runtime, session });
  React.useEffect(() => { setRequestError(null); setResponseWarning(null); }, [session.revision]);
  const editUserMessage = useLastUserMessageEdit({ messages, isLoading,
    retryInput: runtime.mainSession?.retryInput });
  const reading = mainReading, retrySource = runtime.mainSession?.retryInput || '';
  const handleRetry = React.useCallback(async (content) => {
    const retryContent = typeof content === 'string'
      ? content
      : (editUserMessage.isActive ? editUserMessage.content : undefined);
    const ok = await generation.retry(retryContent);
    if (ok) editUserMessage.finish();
    return ok;
  }, [editUserMessage, generation]);
  const toggleHistory = () => setShowMsgHistory(value => !value);
  return <div className="chat-panel" data-gc-part="chat-panel"
    ref={chatPanelRef} onClick={showMsgHistory ? undefined : reading.advanceVisiblePage}>
    <PlatformRequestErrorNotice error={persistence.error ? `存档失败：${persistence.error.message}` : requestError} onClose={() => setRequestError(null)} />
    <PlatformResponseWarningNotice warning={responseWarning} onClose={() => setResponseWarning(null)} />
    <GameCardStyleHost card={runtime.activeCard} />
    <BackgroundRuntime backgroundRequest={presentation.backgroundRequest} portraitRequest={presentation.portraitRequest} onBackgroundChange={onBackgroundChange} onPortraitChange={onPortraitChange} onVisualPanelChange={onVisualPanelChange} />
    <GameCardUIRoot card={runtime.activeCard} gameState={runtime.gameState}
      setGameState={runtime.applyUiState || runtime.setGameState} messages={messages} isLoading={isLoading} pendingInput={mainView.pendingInput}
      canRetry={Boolean(retrySource && modelConfig?.apiUrl && modelConfig?.apiKey)}
      retrySource={retrySource} onRetry={handleRetry}
      reading={reading.ui} onReadingNavigate={reading.navigate}
      uiScopeKey={session.revision} onError={runtime.setRuntimeError}
      beginOperation={persistence.manual.beginOperation} canMutate={persistence.manual.canMutate} />
    <div className="chat-main" data-gc-part="chat-main">
      <ChatHeader onToggleHistory={toggleHistory}>
        {showMsgHistory ? <AgentHistoryTitle contexts={mainView.contexts} selected={agentId}
          onSelect={id => setAgentSelection({ session: runtime.mainSession, id })} /> : <GameCardTitleControl
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
        {runtime.runtimeError ? <><GameCardErrorPanel error={runtime.runtimeError} />{runtime.mainSession && !runtime.mainSession.started && !isLoading ? <button type="button" onClick={session.reload}>重新启动游戏</button> : null}</> : null}
        {showMsgHistory ? ChatPanelRenderers.renderMsgHistoryDisplay(mainView.contexts[agentId]?.messages)
          : runtime.activeCard ? <MainMessages messages={messages} reading={mainReading} display={display} displayRevision={displayRevision}
            isLoading={isLoading} handleRetry={handleRetry} /> : <ChatMessages
          display={display} displayRevision={displayRevision} depths={depths}
          {...chatView} isLoading={chatView.streaming}
          handleRetry={handleRetry} scroll={scroll} modelConfig={modelConfig} editUserMessage={editUserMessage} />}
      </div>
      <div className="chat-input-hover-trigger" data-gc-part="chat-input-trigger" onMouseEnter={() => setIsInputTriggerHovered(true)} onMouseLeave={() => setIsInputTriggerHovered(false)} />
    </div>
    <ChatInputArea isLoading={runtime.activeCard ? false : isLoading} isInputHovered={isInputHovered} setIsInputHovered={setIsInputHovered} isInputTriggerHovered={isInputTriggerHovered} setIsInputTriggerHovered={setIsInputTriggerHovered} onSend={generation.send} onStop={generation.stop} />
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
