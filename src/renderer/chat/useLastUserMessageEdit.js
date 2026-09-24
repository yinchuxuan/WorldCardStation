import React from 'react';
import { findLastUserIndex } from './retryMessages.js';

function useLastUserMessageEdit({ messages = [], isLoading = false, retryInput } = {}) {
  const [editingIndex, setEditingIndex] = React.useState(null);
  const [content, setContent] = React.useState('');
  const lastUserIndex = findLastUserIndex(messages);
  const retrySource = retryInput ?? messages[lastUserIndex]?.content ?? '';

  React.useEffect(() => {
    if (editingIndex === null) return;
    if (isLoading || editingIndex !== lastUserIndex) setEditingIndex(null);
  }, [editingIndex, isLoading, lastUserIndex]);

  const start = React.useCallback((index) => {
    if (isLoading || index !== lastUserIndex) return;
    setEditingIndex(index);
    setContent(retrySource);
  }, [isLoading, lastUserIndex, retrySource]);

  return {
    content,
    retrySource,
    isActive: editingIndex !== null,
    isEditing: (index) => editingIndex === index,
    canEdit: (index) => !isLoading && index === lastUserIndex,
    start,
    change: setContent,
    cancel: () => setEditingIndex(null),
    finish: () => setEditingIndex(null)
  };
}

export default useLastUserMessageEdit;
