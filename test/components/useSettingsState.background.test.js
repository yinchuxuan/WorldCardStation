const { renderHook, act: hookAct } = require('@testing-library/react');

const platformMock = global.platformMock;

describe('useSettingsState Hook - Background Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: 'http://api.example.com', apiKey: 'test-key', modelName: 'gpt-4' }
    });
    platformMock.getBackgroundConfig.mockResolvedValue({
      success: true,
      config: { backgroundImageUrl: '', backgroundOpacity: 0.5 }
    });
    platformMock.saveBackgroundConfig.mockResolvedValue({ success: true });
    platformMock.selectBackgroundImage.mockResolvedValue({ success: false, canceled: true });
  });


  test('should handle handleBackgroundChange for backgroundImageUrl with auto-save', async () => {
    const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;
    const { result } = renderHook(() => useSettingsState(jest.fn()));

    await hookAct(async () => { await Promise.resolve(); });

    hookAct(() => {
      result.current.handleBackgroundChange('backgroundImageUrl', 'new-bg-url');
    });

    expect(result.current.backgroundConfig.backgroundImageUrl).toBe('new-bg-url');
    expect(platformMock.saveBackgroundConfig).toHaveBeenCalledWith({
      backgroundImageUrl: 'new-bg-url',
      backgroundOpacity: 0.5
    });
  });

  test('should handle handleBackgroundChange for backgroundOpacity with auto-save', async () => {
    const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;
    const { result } = renderHook(() => useSettingsState(jest.fn()));

    await hookAct(async () => { await Promise.resolve(); });

    hookAct(() => { result.current.handleBackgroundChange('backgroundOpacity', 0.8); });

    expect(result.current.backgroundConfig.backgroundOpacity).toBe(0.8);
    expect(platformMock.saveBackgroundConfig).toHaveBeenCalledWith({
      backgroundImageUrl: '',
      backgroundOpacity: 0.8
    });
  });

  test('should handle handleSelectBackgroundImage successfully with auto-save', async () => {
    platformMock.selectBackgroundImage.mockResolvedValue({
      success: true,
      localUrl: 'local://user-background/current'
    });
    platformMock.saveBackgroundConfig.mockResolvedValue({
      success: true,
      config: { backgroundImageUrl: 'local://user-background/current', backgroundOpacity: 0.5 }
    });

    const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;
    const { result } = renderHook(() => useSettingsState(jest.fn()));

    await hookAct(async () => { await Promise.resolve(); });

    await hookAct(async () => { await result.current.handleSelectBackgroundImage(); });

    expect(platformMock.selectBackgroundImage).toHaveBeenCalled();
    expect(platformMock.saveBackgroundConfig).toHaveBeenCalledWith({
      backgroundImageUrl: 'local://user-background/current',
      backgroundOpacity: 0.5
    });
    expect(result.current.backgroundConfig.backgroundImageUrl).toBe('local://localhost/user-background/current');
  });

  test('should handle canceled image selection', async () => {
    platformMock.selectBackgroundImage.mockResolvedValue({ success: false, canceled: true });

    const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;
    const { result } = renderHook(() => useSettingsState(jest.fn()));

    await hookAct(async () => { await Promise.resolve(); });

    const initialUrl = result.current.backgroundConfig.backgroundImageUrl;

    await hookAct(async () => { await result.current.handleSelectBackgroundImage(); });

    expect(result.current.backgroundConfig.backgroundImageUrl).toBe(initialUrl);
  });

  test('should keep the previous image when selection fails', async () => {
    platformMock.selectBackgroundImage.mockResolvedValue({
      success: false,
      error: 'Invalid image'
    });

    const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;
    const { result } = renderHook(() => useSettingsState(jest.fn()));

    await hookAct(async () => { await Promise.resolve(); });

    const initialUrl = result.current.backgroundConfig.backgroundImageUrl;

    await hookAct(async () => { await result.current.handleSelectBackgroundImage(); });

    expect(result.current.backgroundConfig.backgroundImageUrl).toBe(initialUrl);
  });

  test('should handle handleClearBackgroundImage with auto-save', async () => {
    platformMock.getBackgroundConfig.mockResolvedValue({
      success: true,
      config: { backgroundImageUrl: 'bg-url', backgroundOpacity: 0.5 }
    });

    const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;
    const { result } = renderHook(() => useSettingsState(jest.fn()));

    await hookAct(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    hookAct(() => { result.current.handleClearBackgroundImage(); });

    expect(result.current.backgroundConfig.backgroundImageUrl).toBe('');
    expect(platformMock.saveBackgroundConfig).toHaveBeenCalledWith({
      backgroundImageUrl: '',
      backgroundOpacity: 0.5
    });
  });

  test('should call onBackgroundChange callback on save success', async () => {
    const onBackgroundChange = jest.fn();
    const useSettingsState = require('../../src/renderer/settings/useSettingsState.js').default;
    const { result } = renderHook(() => useSettingsState(onBackgroundChange));

    await hookAct(async () => { await Promise.resolve(); });

    await hookAct(async () => {
      result.current.handleBackgroundChange('backgroundImageUrl', 'saved-bg');
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(onBackgroundChange).toHaveBeenCalledWith({
      backgroundImageUrl: 'saved-bg',
      backgroundOpacity: 0.5
    });
  });
});
