import React from 'react';
import { rendererServices } from '../platform/index.js';

function SettingsGameCardDevelopment() {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const copying = React.useRef(false);
  const instructionsId = React.useId();

  const handleCopy = async () => {
    if (copying.current) return;
    copying.current = true;
    setBusy(true);
    setResult(null);
    try {
      const text = await rendererServices.development.getInstructions();
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        setResult({ kind: 'success', message: '已复制，请粘贴到 agent 对话中' });
      } catch {
        setResult({ kind: 'fallback', message: '无法自动复制，请手动复制下方指令', text });
      }
    } catch (error) {
      setResult({ kind: 'error', message: `生成开发指令失败：${error.message || String(error)}` });
    } finally {
      copying.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="settings-development" aria-label="游戏卡开发">
      <h3><span className="material-icons" aria-hidden="true">code</span>游戏卡开发</h3>
      <button type="button" className="md-btn md-btn-tonal" disabled={busy} onClick={handleCopy}>
        <span className="material-icons" aria-hidden="true">content_copy</span>
        {busy ? '正在生成开发指令…' : '复制给 agent 的开发指令'}
      </button>
      {result && (
        <p className={`settings-development-result ${result.kind}`}
          role={result.kind === 'error' ? 'alert' : 'status'}>{result.message}</p>
      )}
      {result?.text && (
        <label className="settings-development-manual" htmlFor={instructionsId}>
          开发指令（可手动复制）
          <textarea id={instructionsId} readOnly value={result.text} rows={9}
            spellCheck={false} onFocus={event => event.currentTarget.select()} />
        </label>
      )}
    </section>
  );
}

export default SettingsGameCardDevelopment;
