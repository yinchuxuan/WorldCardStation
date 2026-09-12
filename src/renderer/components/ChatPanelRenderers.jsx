import React from 'react';

const ChatPanelRenderers = {
  renderMsgHistoryDisplay(msgHistoryMessages) {
    if (!msgHistoryMessages || msgHistoryMessages.length === 0) {
      return <div className="chat-empty">
        <span className="material-icons empty-icon">inbox</span>
        <div>暂无消息历史记录</div>
      </div>;
    }
    const msgsArray = msgHistoryMessages.map(msg => {
      const result = { role: msg.role, content: msg.content };
      const thinking = msg.thinking || msg._thinking;
      if (thinking) result.thinking = thinking;
      if (msg._meta) result._meta = msg._meta;
      if (msg.ttl !== undefined) result.ttl = msg.ttl;
      return result;
    });
    return <div className="msg-history-card" data-gc-part="message-history">
      <pre className="msg-history-json" data-gc-part="message-history-content">
        {JSON.stringify({ msgs: msgsArray }, null, 2)}
      </pre>
    </div>;
  }
};

export default ChatPanelRenderers;
