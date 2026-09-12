import React from 'react';
import { runtimeTrace } from '../trace/runtimeTrace.js';
import { PropTypes } from './componentPropTypes.js';

function RuntimeTraceControl({ icon = 'extension' }) {
  const trace = React.useSyncExternalStore(runtimeTrace.subscribe, runtimeTrace.getSnapshot);
  const state = trace.busy ? 'busy' : trace.error ? 'error'
    : !trace.enabled ? 'off' : trace.path ? 'recording' : 'waiting';
  const status = trace.busy ? '正在切换…' : trace.error ? '日志不完整'
    : !trace.enabled ? '已关闭' : trace.path ? '正在记录' : '等待游戏卡会话';
  const description = trace.enabled
    ? '再次点击关闭。复现后可让 agent 查找当前会话日志。'
    : '点击开启，自动在当前游戏卡会话记录完整消息和游戏状态，仅保存在本机；分享前请检查隐私。';
  return <div className="runtime-trace-control" onClick={event => event.stopPropagation()}>
    <button type="button" className="runtime-trace-toggle" aria-label="开发者模式"
      data-state={state} aria-pressed={trace.enabled} disabled={trace.busy}
      title={`开发者模式：${status}。${description}`}
      onClick={() => { void runtimeTrace.enable(!trace.enabled); }}>
      <span className="material-icons game-card-title-icon" data-gc-part="game-card-title-icon" aria-hidden="true">{icon}</span>
      <span role="status" className="runtime-trace-status">{status}</span>
    </button>
    {trace.error ? <p role="alert" className="runtime-trace-error">{trace.error}</p> : null}
  </div>;
}

RuntimeTraceControl.propTypes = { icon: PropTypes.string };

export default RuntimeTraceControl;
