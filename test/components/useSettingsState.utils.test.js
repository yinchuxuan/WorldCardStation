const { renderHook, act } = require('@testing-library/react');
const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;

test('masks keys without exposing short secrets, including the length boundary', async () => {
  const { result } = renderHook(() => useSettingsState());
  await act(async () => {});
  for (const [key, expected] of [
    [null, ''], ['', ''], ['short', '****'], ['12345678', '****'],
    ['123456789', '1234****6789'], ['test-api-key-12345', 'test****2345']
  ]) expect(result.current.maskApiKey(key)).toBe(expected);
});

test.each([
  [{}, false], [{ apiUrl: 'https://api.test.com' }, true],
  [{ apiKey: 'key' }, true], [{ modelName: 'model' }, true],
  [{ apiUrl: 'https://api.test.com', apiKey: 'key', modelName: 'model' }, true]
])('recognizes partial configuration %j', async (config, expected) => {
  global.platformMock.getModelConfig.mockResolvedValue({ success: true, config });
  const { result } = renderHook(() => useSettingsState());
  await act(async () => {});
  expect(Boolean(result.current.isConfigured)).toBe(expected);
});
