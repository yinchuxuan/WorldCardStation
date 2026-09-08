import React from 'react';
import { createPortal } from 'react-dom';
import { PropTypes } from './componentPropTypes.js';

function TavernImportDialog({ request, isLoading, onFinish }) {
  const dialog = React.useRef(null);
  const overwrite = request.kind === 'overwrite';
  React.useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);
  const handleKey = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onFinish(false); }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled)')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="tavern-import-overlay" onClick={event => event.stopPropagation()}>
    <section className="tavern-import-dialog" role="dialog" aria-modal="true" aria-labelledby="tavern-import-title"
      tabIndex={-1} ref={dialog} onKeyDown={handleKey}>
      <h2 id="tavern-import-title">{overwrite ? '确认覆盖游戏卡' : '酒馆卡兼容差异'}</h2>
      {overwrite ? <p role="alert">将用“{request.name}”替换“{request.targetCard.name || request.targetCard.id}”（{request.targetCard.id}）的资源并保留存档；旧状态可能不兼容，不自动迁移。</p> : <>
        <p>“{request.name}”有以下功能无法完整转换，是否继续导入？</p>
        <div className="tavern-import-report" aria-label="兼容差异">
          {request.report.map((item, index) => <p key={`${item.code}-${index}`} data-severity="warning">
            <span>{item.location}</span><br />{item.message}
          </p>)}
        </div>
      </>}
      <footer>
        <button type="button" onClick={() => onFinish(false)}>取消</button>
        <button type="button" disabled={isLoading} onClick={() => onFinish(true)}>
          {overwrite ? '覆盖并导入' : '继续导入'}
        </button>
      </footer>
      {isLoading ? <p role="alert">生成完成后才能安装卡片</p> : null}
    </section>
  </div>, document.body);
}

TavernImportDialog.propTypes = {
  request: PropTypes.object.isRequired, isLoading: PropTypes.bool, onFinish: PropTypes.func.isRequired
};

export default TavernImportDialog;
