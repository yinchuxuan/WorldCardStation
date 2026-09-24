const INTERACTIVE_SELECTOR = [
  'a', 'button', 'input', 'textarea', 'select', 'label',
  '[role="button"]', '[contenteditable="true"]',
  '[data-gc-part="chat-header"]', '.chat-message-editable-bubble',
  '[data-gc-chat-input-value]', '[data-gc-chat-input-value-from]',
  '[data-gc-chat-input-label]'
].join(',');

function isSegmentAdvanceEvent(event) {
  if (!event) return true;
  if (event.defaultPrevented || (event.type === 'click' && event.button !== 0)) return false;
  const interactive = event.target?.closest?.(INTERACTIVE_SELECTOR);
  if (interactive && interactive !== event.currentTarget) return false;
  const view = event.currentTarget?.ownerDocument?.defaultView
    || event.target?.ownerDocument?.defaultView
    || event.currentTarget;
  const selection = view?.getSelection?.();
  return !selection || selection.isCollapsed;
}

export { isSegmentAdvanceEvent };
