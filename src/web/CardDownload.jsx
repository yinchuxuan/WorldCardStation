import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { hostedCards } from './hostedCards.js';

function CardDownload({ card }) {
  const controller = useRef(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { const current = controller.current; controller.current = null; current?.abort(); }, []);
  async function prepare() {
    const current = new AbortController();
    controller.current = current; setBusy(true); setError(''); setProgress(null);
    try {
      await hostedCards.prepare(card, { signal: current.signal,
        onProgress: value => { if (!current.signal.aborted) setProgress(value); } });
    } catch (reason) {
      if (controller.current === current) {
        setProgress(null);
        setError(reason.name === 'AbortError' ? '下载已取消，重试会保留已校验的文件。' : reason.message);
      }
    } finally { if (controller.current === current) setBusy(false); }
  }
  const bytes = value => `${(value / 1024 / 1024).toFixed(2)} MB`;
  return <div className="card-download">
    <button type="button" disabled={busy} onClick={prepare}>{error ? '重试下载' : '下载资源 / 检查缓存'}</button>
    {busy && <button type="button" onClick={() => controller.current.abort()}>取消下载</button>}
    {progress && <p data-download-phase={progress.phase} aria-live="polite">
      {progress.phase === 'ready' ? '资源已就绪，规则预加载完成。游玩功能尚未开放。'
        : progress.phase === 'checking' ? '正在检查缓存…'
          : progress.phase === 'preloading' ? '正在预加载规则…'
            : `下载并校验：${bytes(progress.completedBytes)} / ${bytes(progress.totalBytes)}`}
    </p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
CardDownload.propTypes = { card: PropTypes.object.isRequired };
export default CardDownload;
