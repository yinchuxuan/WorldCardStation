const { renderHook, act } = require('@testing-library/react');
const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;

function services(config = {}, background = {}) {
  return {
    config: { load: jest.fn().mockResolvedValue(config), save: jest.fn() },
    background: { load: jest.fn().mockResolvedValue(background), save: jest.fn() }
  };
}

test('merges saved settings with defaults and publishes the loaded background', async () => {
  const saved = { apiUrl: 'https://api.test.com', apiKey: 'key', modelName: 'model-1' };
  const background = { backgroundImageUrl: 'bg.png', backgroundOpacity: 0.8 };
  const io = services(saved, background);
  const notify = jest.fn();
  const { result } = renderHook(() => useSettingsState(notify, io));
  await act(async () => {});
  expect(result.current.config).toMatchObject({
    ...saved, protocol: 'openai', maxTokens: '50000', temperature: '1', topP: '1',
    frequencyPenalty: '0', presencePenalty: '0', reasoningEffort: ''
  });
  expect(result.current.backgroundConfig).toEqual(background);
  expect(notify).toHaveBeenCalledWith(background);
});

test('uses defaults for an empty configuration', async () => {
  const io = services();
  const { result } = renderHook(() => useSettingsState(undefined, io));
  await act(async () => {});
  expect(result.current.config).toMatchObject({ apiUrl: '', apiKey: '', modelName: '', protocol: 'openai' });
  expect(result.current.backgroundConfig).toEqual({ backgroundImageUrl: '', backgroundOpacity: 0.5 });
  expect(result.current.error).toBeNull();
});

test('reports a load error without publishing an incomplete configuration', async () => {
  const io = services();
  const error = new Error('配置读取失败');
  io.config.load.mockRejectedValue(error);
  const notify = jest.fn();
  const { result } = renderHook(() => useSettingsState(notify, io));
  await act(async () => {});
  expect(result.current.error).toBe(error);
  expect(result.current.config.apiUrl).toBe('');
  expect(notify).not.toHaveBeenCalled();
});
