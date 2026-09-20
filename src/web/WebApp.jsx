import React from 'react';
import { capabilities, savePolicy } from '@platform';
import WebCatalog from './WebCatalog.jsx';

function WebApp() {
  return (
    <main className="web-startup" data-platform="web" data-save-policy={savePolicy}>
      <h1>世界站 · World Card Station</h1>
      <h2>Web 预览版</h2>
      <p role="status">浏览器端已启动。可以浏览游戏并下载资源；游玩和存档功能尚未开放。</p>
      <button type="button" disabled={!capabilities.gameplay}>普通聊天（筹备中）</button>
      <p>正式游玩版本将采用手动保存；当前版本不保存游戏进度。</p>
      <WebCatalog />
    </main>
  );
}

export default WebApp;
