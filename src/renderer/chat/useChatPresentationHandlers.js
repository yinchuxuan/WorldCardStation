import React from 'react';

function useChatPresentationHandlers(card, presentation) {
  const {
    stopBgm,
    updateAll,
    updateBackground,
    updateChanged,
    updatePortrait
  } = presentation;
  const updateInitialPresentation = React.useCallback((loadedCard, state) => {
    if (loadedCard?.display?.segmentedReading !== true) {
      updateAll(loadedCard, state);
      return;
    }
    updateBackground(loadedCard, state);
    updatePortrait(loadedCard, state);
  }, [updateAll, updateBackground, updatePortrait]);
  const onStreamContentStart = React.useCallback(({ card: streamCard, state }) => {
    if (streamCard?.presentation?.autoUpdateOnFirstToken === false) return;
    updateInitialPresentation(streamCard, state);
  }, [updateInitialPresentation]);

  const onSessionLoaded = React.useCallback(({ card: loadedCard, state }) => {
    updateAll(loadedCard, state);
  }, [updateAll]);

  const onRetryStateRestore = React.useCallback((state) => {
    if (card?.presentation?.autoUpdateOnFirstToken === false) return;
    updateBackground(card, state);
    updatePortrait(card, state);
  }, [card, updateBackground, updatePortrait]);

  const onRequestFailureRestore = React.useCallback((state) => {
    stopBgm();
    updateAll(card, state);
  }, [card, stopBgm, updateAll]);

  const onStatePatchApplied = React.useCallback((result) => {
    const loadedCard = result.card || card;
    const changedKeys = result.presentationChangedKeys || [];
    const bgmWasSet = result.patchTrace?.setPaths?.includes('audio.bgm');
    const presentationKeys = loadedCard?.display?.segmentedReading === true && bgmWasSet
      ? [...new Set([...changedKeys, 'audio.bgm'])]
      : changedKeys;
    updateChanged(
      loadedCard,
      result.state,
      presentationKeys
    );
  }, [card, updateChanged]);

  return {
    onRetryStateRestore,
    onRequestFailureRestore,
    onValidationRetry: onRequestFailureRestore,
    onSessionLoaded,
    onStatePatchApplied,
    onStreamContentStart
  };
}

export default useChatPresentationHandlers;
