import React from 'react';
import { subscribeChatInputCommands } from './chat/chatInputCommands.js';
import { PropTypes } from './components/componentPropTypes.js';

function ChatInputArea({
  isLoading,
  hidden = false,
  isInputHovered,
  setIsInputHovered,
  isInputTriggerHovered,
  setIsInputTriggerHovered,
  onSend,
  onStop
}) {
  const R = React;
  const [inputValue, setInputValue] = R.useState('');
  const [isFocused, setIsFocused] = R.useState(false);
  const formRef = R.useRef(null), textareaRef = R.useRef(null);
  const isVisible = isLoading || isInputHovered || isFocused || inputValue.length > 0 || isInputTriggerHovered;
  const focusInput = R.useCallback(() => {
    if (hidden) return;
    setIsInputHovered(true);
    textareaRef.current?.focus();
  }, [hidden, setIsInputHovered]);

  const submitValue = R.useCallback(async (rawValue, formElement) => {
    const value = String(rawValue || '');
    if (!value.trim() || isLoading || hidden) return;
    const accepted = await onSend?.(value);
    if (!accepted) return;
    setInputValue(''); setIsInputHovered(false); setIsInputTriggerHovered(false);
    const textarea = formElement?.querySelector('textarea') || textareaRef.current;
    if (textarea) textarea.blur();
  }, [hidden, isLoading, onSend, setIsInputHovered, setIsInputTriggerHovered]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (hidden) return;
    if (isLoading) { onStop?.(); return; }
    await submitValue(inputValue, e.currentTarget);
  };

  R.useEffect(() => {
    const handler = (action = {}) => {
      if (action.type === 'chat.input.set') {
        setInputValue(String(action.value || ''));
        if (action.focus) focusInput();
      } else if (action.type === 'chat.input.append') {
        setInputValue(prev => prev + String(action.value || ''));
        if (action.focus) focusInput();
      } else if (action.type === 'chat.input.clear') {
        setInputValue('');
      } else if (action.type === 'chat.input.focus') {
        focusInput();
      } else if (action.type === 'chat.input.submit') {
        formRef.current?.requestSubmit();
      } else if (action.type === 'chat.send') {
        submitValue(action.content, formRef.current);
      }
    };
    return subscribeChatInputCommands(handler);
  }, [focusInput, submitValue]);

  R.useEffect(() => { if (hidden) setIsFocused(false); }, [hidden]);
  if (hidden) return null;
  return <form className={`chat-input-area${isVisible ? ' chat-input-area-visible' : ''}`}
    data-gc-part="chat-input" ref={formRef} onSubmit={handleSubmit}
    onMouseEnter={() => setIsInputHovered(true)} onMouseLeave={() => setIsInputHovered(false)}>
    <textarea className="chat-input-textarea" data-gc-part="chat-input-textarea"
      ref={textareaRef} value={inputValue} onChange={event => setInputValue(event.target.value)}
      placeholder="输入您的回答..." disabled={isLoading} rows={1}
      onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          event.target.form.requestSubmit();
        }
      }} />
    <button type="submit" className="md-btn md-btn-icon send-icon-btn"
      data-gc-part="chat-send-button" disabled={isLoading ? false : !inputValue.trim()}
      aria-label={isLoading ? '停止生成' : '发送消息'}
      title={isLoading ? '停止生成' : '发送消息'}>
      <span className="material-icons">{isLoading ? 'stop' : 'send'}</span>
    </button>
  </form>;
}

ChatInputArea.propTypes = {
  hidden: PropTypes.bool,
  isLoading: PropTypes.bool.isRequired,
  isInputHovered: PropTypes.bool.isRequired,
  setIsInputHovered: PropTypes.func.isRequired,
  isInputTriggerHovered: PropTypes.bool.isRequired,
  setIsInputTriggerHovered: PropTypes.func.isRequired,
  onSend: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired
};

export default ChatInputArea;
