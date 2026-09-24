const { findLastRoleIndex } = require('../../src/renderer/chat/messageSelection.js');

test.each([
  ['user', ['user', 'assistant', 'user', 'assistant'], 2],
  ['user', ['assistant', 'assistant'], -1],
  ['assistant', ['user', 'assistant', 'user'], 1],
  ['assistant', ['user', 'user'], -1]
])('%s finds the last matching role in %j', (role, roles, expected) => {
  expect(findLastRoleIndex(roles.map(role => ({ role, content: 'text' })), role)).toBe(expected);
});
