const React = require('react');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
const SettingsPanel = require('../../src/renderer/components/SettingsPanel.jsx').default;
const { testModelConnection } = require('../../src/renderer/chat/modelConnectionTest.js');

// Keep the panel, child controls and settings hook real; only replace external I/O.
jest.mock('../../src/renderer/chat/modelConnectionTest.js', () => ({
  testModelConnection: jest.fn().mockResolvedValue(undefined)
}));

const config = { apiUrl: 'https://api.example.com/v1', apiKey: 'test-key', modelName: 'test-model' };
const background = { backgroundImageUrl: 'background.png', backgroundOpacity: 0.5 };

beforeEach(() => {
  jest.clearAllMocks();
  global.platformMock.getModelConfig.mockResolvedValue({ success: true, config });
  global.platformMock.getBackgroundConfig.mockResolvedValue({ success: true, config: background });
});

async function mount(props = {}) {
  const view = render(React.createElement(SettingsPanel, { theme: 'light', onToggleTheme: jest.fn(), ...props }));
  await screen.findByText('test-model');
  return view;
}

test('loads saved settings and tests the displayed model through the real controls', async () => {
  const onBackgroundChange = jest.fn();
  await mount({ onBackgroundChange });
  expect(screen.getByText('系统配置')).toBeInTheDocument();
  expect(screen.getByAltText('背景预览')).toHaveAttribute('src', background.backgroundImageUrl);
  expect(onBackgroundChange).toHaveBeenCalledWith(background);
  expect(screen.queryByText(/(?:开启|关闭)分段阅读/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '已配置' }));
  await screen.findByRole('button', { name: '已连接' });
  expect(testModelConnection).toHaveBeenCalledWith(expect.objectContaining(config));
});

test('toggles theme and reflects the theme supplied by the app', async () => {
  const onToggleTheme = jest.fn();
  const view = await mount({ onToggleTheme });
  fireEvent.click(screen.getByRole('button', { name: /切换到深色/ }));
  expect(onToggleTheme).toHaveBeenCalledTimes(1);
  view.rerender(React.createElement(SettingsPanel, { theme: 'dark', onToggleTheme }));
  expect(screen.getByRole('button', { name: /切换到浅色/ })).toBeInTheDocument();
});

test('opens at the edge, stays open over its controls, and closes on leaving', async () => {
  await mount();
  const panel = document.querySelector('.settings-panel');
  expect(panel).not.toHaveClass('visible');
  fireEvent.mouseEnter(document.querySelector('.settings-trigger-zone'));
  expect(panel).toHaveClass('visible');
  fireEvent.mouseEnter(screen.getByText('模型配置'));
  expect(panel).toHaveClass('visible');
  fireEvent.mouseLeave(document.querySelector('.settings-trigger-zone'));
  expect(panel).not.toHaveClass('visible');
});

test('surfaces failures loading settings instead of silently showing empty configuration', async () => {
  global.platformMock.getModelConfig.mockRejectedValue(new Error('配置读取失败'));
  render(React.createElement(SettingsPanel, { theme: 'light', onToggleTheme: jest.fn() }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('配置读取失败'));
});
