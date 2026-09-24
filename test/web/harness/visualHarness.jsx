import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import GameCardPortraitLayers from '../../../src/renderer/components/GameCardPortraitLayers.jsx';
import MessageContent from '../../../src/renderer/components/MessageContent.jsx';
import renderers from '../../../src/renderer/components/ChatPanelMessageRenderers.jsx';
import { highlightQuotes } from '../../../src/renderer/components/highlightQuotes.js';

const url = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="orange"/></svg>';
let root;
window.visualHarness = {
  retries: 0,
  async show({ position = 'center', theme = 'light', portraits = false, count = 1, transition = 'enter' } = {}) {
    await import('../../../src/renderer/styles/renderer.css');
    if (!root) {
      document.getElementById('result').hidden = true;
      const host = document.createElement('div');
      host.id = 'root'; document.body.append(host); root = createRoot(host);
    }
    document.documentElement.dataset.theme = theme;
    const current = Array.from({ length: count }, (_, index) => ({
      character: `character-${index}`, expression: transition, transition, index, url
    }));
    const layers = { current, exiting: [], exitingCount: 0, expressionExits: [] };
    if (transition === 'exit') Object.assign(layers, { current: [], exiting: current, exitingCount: count });
    if (transition === 'expression') layers.expressionExits = current.map(item => ({ ...item, expression: 'previous' }));
    flushSync(() => root.render(<div key={`${portraits}-${count}-${transition}`}
      className={`app-container has-background-image game-card-visual-position-${position}`}>
      <div className="app-background-layer app-background-layer-current" />
      {portraits ? <GameCardPortraitLayers layers={layers} onExitEnd={() => {}} onExpressionExitEnd={() => {}} /> :
        <div className="chat-panel"><div className="chat-main"><div className="chat-history">
          <div className="chat-reading-veil" />
          <div className="chat-messages-layer">
            {['user', 'assistant'].map(role => <div key={role}
              className={`chat-message-row ${role === 'user' ? 'retry-source-row' : ''}`}>
              <div className={`chat-message ${role}`}><div className="chat-message-bubble">
                <MessageContent role={role} content={'正文 “引用内容” '.repeat(12)} quoteHighlighter={highlightQuotes} />
              </div></div>
              {role === 'user' && renderers.renderRetryBtn({ isLast: true, isLoading: false,
                handleRetry: () => { window.visualHarness.retries += 1; } })}
            </div>)}
          </div>
          <div className="collapse-inner-wrapper">折叠后的正文</div>
        </div></div></div>}
    </div>));
  }
};
