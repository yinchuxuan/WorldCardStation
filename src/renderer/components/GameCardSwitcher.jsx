import React from 'react';
import { normalizeGameCardError } from '../gameCard/runtimeError.js';
import { rendererServices, capabilities } from '../platform/index.js';
import GameCardTransferStatus from './GameCardTransferStatus.jsx';
import GameCardSwitchRow from './GameCardSwitchRow.jsx';
import TavernImportDialog from './TavernImportDialog.jsx';
import { useGameCardImport } from '../gameCard/useGameCardImport.js';
import { gameCard, PropTypes } from './componentPropTypes.js';

const IDLE_IMPORT = Object.freeze({ state: 'idle', message: '' });

function GameCardSwitcher({
  activeCard,
  isLoading,
  onActivate,
  onImport,
  onUninstall,
  onError,
  repository = rendererServices.cards
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [cards, setCards] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [removingId, setRemovingId] = React.useState('');
  const [importStatus, setImportStatus] = React.useState(IDLE_IMPORT);
  const closeTimer = React.useRef(null);
  const download = React.useRef(null);
  const hosted = capabilities?.cardImport === false;
  const conversion = useGameCardImport(onImport);

  const loadCards = React.useCallback(async () => {
    try {
      const result = await repository.list();
      setCards(Array.isArray(result) ? result : []);
    } catch (error) {
      onError?.(normalizeGameCardError(error, { title: '读取游戏卡失败' }));
    }
  }, [onError, repository]);

  React.useEffect(() => {
    if (open || !mounted) return undefined;
    const timer = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [mounted, open]);

  React.useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  React.useEffect(() => () => download.current?.abort(), []);

  const toggle = (event) => {
    event.stopPropagation();
    if (isLoading || busy) return;
    const nextOpen = !open;
    if (nextOpen) {
      setMounted(true);
      void loadCards();
    }
    setOpen(nextOpen);
  };

  const activate = async (event, card) => {
    event.stopPropagation();
    if (busy || (card?.id || null) === (activeCard?.id || null)) {
      setOpen(false);
      return;
    }
    setBusy(true);
    onError?.(null);
    try {
      if (hosted) download.current = new AbortController();
      const options = hosted ? { signal: download.current.signal, onProgress: progress => {
        const size = value => (value / 1024 / 1024).toFixed(2);
        setImportStatus({ state: 'importing', message: progress.phase === 'downloading'
          ? `下载并校验：${size(progress.completedBytes)} / ${size(progress.totalBytes)} MB`
          : progress.phase === 'checking' ? '正在检查缓存…' : '正在准备游戏…' });
      } } : undefined;
      if (hosted) await onActivate(card, options);
      else await onActivate(card);
      setOpen(false);
    } catch (error) {
      onError?.(normalizeGameCardError(error, { title: '切换游戏卡失败' }));
    } finally {
      download.current = null;
      if (hosted) setImportStatus(IDLE_IMPORT);
      setBusy(false);
    }
  };

  const importCard = async (event, targetCard = null) => {
    event.stopPropagation();
    if (busy || isLoading) return;
    window.clearTimeout(closeTimer.current);
    setBusy(true);
    setImportStatus({ state: 'importing', message: '正在导入游戏卡…' });
    onError?.(null);
    try {
      const card = await conversion.run(targetCard, message => setImportStatus({ state: 'importing', message }));
      if (card) {
        await loadCards();
        const name = card.name || card.id || '游戏卡';
        setImportStatus({ state: 'success', message: `导入成功：${name}` });
        closeTimer.current = window.setTimeout(() => {
          setOpen(false);
          setImportStatus(IDLE_IMPORT);
        }, 1600);
      } else {
        setImportStatus(IDLE_IMPORT);
      }
    } catch (error) {
      if (error.canceled) {
        setImportStatus(IDLE_IMPORT);
      } else {
        setImportStatus({ state: 'error', message: '导入失败，请查看错误详情' });
        onError?.(normalizeGameCardError(error, { title: '导入游戏卡失败' }));
      }
    } finally {
      setBusy(false);
    }
  };

  const uninstallCard = async (event, card) => {
    event.stopPropagation();
    if (busy || !card?.id) return;
    const name = card.name || card.id;
    if (window.confirm && !window.confirm(`卸载“${name}”？\n\n这会删除游戏卡资源和全部存档，且无法恢复。`)) return;
    window.clearTimeout(closeTimer.current);
    setImportStatus(IDLE_IMPORT);
    setBusy(true);
    setRemovingId(card.id);
    onError?.(null);
    try {
      await onUninstall(card);
      await loadCards();
    } catch (error) {
      onError?.(normalizeGameCardError(error, { title: '卸载游戏卡失败' }));
    } finally {
      setRemovingId('');
      setBusy(false);
    }
  };

  const title = activeCard?.name || activeCard?.id || '普通聊天';
  const renderCard = card => <GameCardSwitchRow key={card?.id || 'no-card'} card={card}
    active={(card?.id || null) === (activeCard?.id || null)} busy={busy || isLoading}
    removing={removingId === card?.id} onActivate={activate}
    onUninstall={hosted ? undefined : uninstallCard} onUpdate={hosted ? undefined : importCard} />;

  return <div className="game-card-switcher" data-gc-part="game-card-switcher">
    <button type="button" className="game-card-title-main" data-gc-part="game-card-title-main"
      onClick={toggle} disabled={isLoading || busy} aria-label="切换游戏卡"
      title={isLoading ? '生成完成后可切换游戏卡' : `切换游戏卡：${title}`}
      aria-expanded={open} aria-controls="game-card-switch-panel">
      <span className="game-card-title-name" data-gc-part="game-card-title-name">{title}</span>
    </button>
    {mounted ? <div id="game-card-switch-panel" className="game-card-switch-panel"
      data-state={open ? 'open' : 'closing'} aria-hidden={!open}
      onClick={event => event.stopPropagation()}>
      <div className="game-card-switch-heading">切换游戏卡</div>
      {hosted && <p className="game-card-import-message">选择托管游戏后检查并下载完整资源。当前预览版暂不保存进度。</p>}
      <div className="game-card-switch-list">
        {renderCard(null)}
        {cards.map(renderCard)}
      </div>
      {!hosted && <button type="button" className="game-card-switch-import" onClick={importCard}
        disabled={busy || isLoading} aria-label="导入游戏卡文件" title="选择卡片文件，或项目目录中的 card.json（导入整个目录）">
        <span className={`material-icons${busy ? ' importing' : ''}`}>
          {busy ? 'progress_activity' : 'upload_file'}
        </span><span>{busy ? '正在导入…' : '导入卡片'}</span>
      </button>}
      {conversion.cancelable ? <button type="button" className="game-card-switch-import" onClick={conversion.cancel}>取消导入</button> : null}
      <GameCardTransferStatus status={importStatus} onCancel={download.current ? () => download.current.abort() : undefined} />
    </div> : null}
    {conversion.request ? <TavernImportDialog key={conversion.request.kind} request={conversion.request}
      isLoading={isLoading} onFinish={conversion.finish} /> : null}
  </div>;
}

GameCardSwitcher.propTypes = {
  activeCard: gameCard,
  isLoading: PropTypes.bool,
  onActivate: PropTypes.func.isRequired,
  onImport: PropTypes.func.isRequired,
  onUninstall: PropTypes.func.isRequired,
  onError: PropTypes.func,
  repository: PropTypes.shape({ list: PropTypes.func.isRequired })
};

export default GameCardSwitcher;
