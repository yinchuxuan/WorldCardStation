export function settle(content) {
  return { text: content.trim(), accepted: content.trim().length > 0 };
}
