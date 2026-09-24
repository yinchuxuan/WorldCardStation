import { sendPlainChatRequest } from '../../src/renderer/chat/plainChatRequest.js';
import { sendChatRequest } from '../../src/renderer/chat/apiClient.js';
jest.mock('../../src/renderer/chat/apiClient.js', () => ({ sendChatRequest: jest.fn() }));

test.each([1, 1000])('plain chat separates first inline thinking across chunks of %i characters', async size => {
  const text = 'before<thinking>reason</thinking>answer<thinking>literal</thinking><state_patch>literal';
  sendChatRequest.mockImplementation(async (_, cb) => {
    cb.onThinkingToken('provider:');
    for (let i = 0; i < text.length; i += size) cb.onToken(text.slice(i, i + size));
  });
  let content = '', thinking = '';
  await sendPlainChatRequest({}, { onToken: text => { content += text; }, onThinkingToken: text => { thinking += text; } });
  expect(thinking).toBe('provider:reason');
  expect(content).toBe('beforeanswer<thinking>literal</thinking><state_patch>literal');
});

test('partial thinking prefixes remain literal at EOF and parser state is per request', async () => {
  sendChatRequest.mockImplementation(async (_, cb) => cb.onToken('<thin'));
  const onToken = jest.fn();
  await sendPlainChatRequest({}, { onToken, onThinkingToken: jest.fn() });
  expect(onToken).toHaveBeenCalledWith('<thin');
  sendChatRequest.mockImplementation(async (_, cb) => cb.onToken('<thinking>new</thinking>body'));
  const onThinkingToken = jest.fn();
  await sendPlainChatRequest({}, { onToken, onThinkingToken });
  expect(onThinkingToken).toHaveBeenCalledWith('new');
  expect(onToken).toHaveBeenLastCalledWith('body');
});
