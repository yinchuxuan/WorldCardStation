import React from 'react';
import { capabilities } from '../platform/index.js';
import ChatHeaderEmblem from './ChatHeaderEmblem.jsx';
import RuntimeTraceControl from './RuntimeTraceControl.jsx';

function ChatHeaderLeadingControl() {
  return capabilities?.diskTrace !== false
    ? <RuntimeTraceControl /> : <ChatHeaderEmblem />;
}

export default ChatHeaderLeadingControl;
