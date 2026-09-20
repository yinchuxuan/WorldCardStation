import React from 'react';
import { rendererServices, savePolicy } from '../platform/index.js';
import { checkImportCanceled, prepareTavernImport } from '../gameCard/prepareTavernImport.js';

function useGameCardSwitching({
  isLoading,
  setIsLoading,
  presentation,
  runtime,
  session,
  repository = rendererServices.cards
}) {
  const loading = React.useRef(isLoading);
  loading.current = isLoading;
  const finishSwitch = React.useCallback(async (card) => {
    runtime.setRuntimeError(null);
    runtime.changeActiveCard(card || null);
    presentation.stopBgm();
    presentation.updateAll(null, {});
    await session.reload();
    return card || null;
  }, [presentation, runtime, session]);

  const activate = React.useCallback(async (card, options) => {
    if (isLoading) return null;
    if (savePolicy === 'manual') {
      if (!window.confirm('当前预览版不保存进度，切换游戏会丢弃本次进度。继续吗？')) return null;
      setIsLoading?.(true);
      try {
        const prepared = await repository.setActive(card?.id || null, options);
        return await finishSwitch(prepared);
      } finally { setIsLoading?.(false); }
    }
    await session.saveCurrent();
    await repository.setActive(card?.id || null);
    return finishSwitch(card);
  }, [finishSwitch, isLoading, repository, session, setIsLoading]);

  const importCard = React.useCallback(async (confirm, { targetCard, signal, onProgress } = {}) => {
    if (isLoading) return null;
    await session.saveCurrent();
    checkImportCanceled(signal);
    let card = await repository.importFile(targetCard ? { tavernOnly: true } : undefined);
    if (card?.kind === 'tavern') {
      const task = card;
      try {
        const revision = await prepareTavernImport(task, { repository, confirm, targetCard, signal, onProgress });
        if (!revision) return null;
        if (loading.current) throw new Error('生成期间不能安装游戏卡，请稍后重试');
        await session.saveCurrent();
        checkImportCanceled(signal);
        if (loading.current) throw new Error('生成期间不能安装游戏卡，请稍后重试');
        onProgress?.('正在安装游戏卡…', false);
        card = await repository.commitTavernImport(task.token, revision);
      } finally {
        await repository.cancelTavernImport(task.token);
      }
    }
    if (!card) return null;
    return finishSwitch(card);
  }, [finishSwitch, isLoading, repository, session]);

  const uninstallCard = React.useCallback(async (card) => {
    if (isLoading || !card?.id) return null;
    const isActive = runtime.activeCard?.id === card.id;
    if (isActive) await session.saveCurrent();
    await repository.uninstall(card.id);
    if (isActive) return finishSwitch(null);
    return card;
  }, [finishSwitch, isLoading, repository, runtime.activeCard?.id, session]);

  return { activate, importCard, uninstallCard };
}

export default useGameCardSwitching;
