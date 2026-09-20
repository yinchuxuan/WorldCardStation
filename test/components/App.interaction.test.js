/**
 * Tests for App Component - Interaction
 */

const React = require('react');
const { render: _render, screen: _screen, fireEvent: _fireEvent, act } = require('@testing-library/react');

const platformMock = global.platformMock;

let chatPanelProps;
const mockChatPanel = (props) => {
  chatPanelProps = props;
  return React.createElement('div', { className: 'chat-panel-mock' }, 'ChatPanel Mock');
};
const mockSettingsPanel = ({ onToggleTheme, theme, onBackgroundChange: _onBackgroundChange }) =>
  React.createElement('div', { className: 'settings-panel-mock' },
    `Settings: ${theme}`,
    React.createElement('button', { onClick: onToggleTheme }, 'Toggle Theme')
  );
let mockCurrentSettingsPanel = mockSettingsPanel;

jest.mock('../../src/renderer/ChatPanel.jsx', () => ({ __esModule: true, default: (props) => mockChatPanel(props) }));
jest.mock('../../src/renderer/components/SettingsPanel.jsx', () => ({
  __esModule: true,
  default: (props) => mockCurrentSettingsPanel(props)
}));

describe('App Component - Interaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }));
    mockCurrentSettingsPanel = mockSettingsPanel;
    chatPanelProps = null;
    platformMock.getBackgroundConfig.mockResolvedValue({
      success: true,
      config: { backgroundImageUrl: '', backgroundOpacity: 0.5 }
    });
    platformMock.getModelConfig.mockResolvedValue({
      success: true,
      config: { apiUrl: '', apiKey: '', modelName: '' }
    });
  });

  test('should handle theme toggle through SettingsPanel', async () => {
    const mockSettingsPanelWithToggle = ({ onToggleTheme, theme }) =>
      React.createElement('button', {
        className: 'toggle-theme-btn',
        onClick: onToggleTheme
      }, `Theme: ${theme}`);

    mockCurrentSettingsPanel = mockSettingsPanelWithToggle;

    localStorage.setItem('theme', 'light');

    const App = require('../../src/renderer/App.jsx').default;
    _render(React.createElement(App, null));

    await act(async () => { await Promise.resolve(); });

    expect(_screen.getByText('Theme: light')).toBeInTheDocument();

    _fireEvent.click(_screen.getByText('Theme: light'));

    await act(async () => { await Promise.resolve(); });

    expect(_screen.getByText('Theme: dark')).toBeInTheDocument();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('should handle background config change', async () => {
    const mockSettingsPanelWithBgChange = ({ onBackgroundChange }) =>
      React.createElement('button', {
        className: 'change-bg-btn',
        onClick: () => onBackgroundChange({
          backgroundImageUrl: 'test-image-url',
          backgroundOpacity: 0.3
        })
      }, 'Change Background');

    mockCurrentSettingsPanel = mockSettingsPanelWithBgChange;

    const App = require('../../src/renderer/App.jsx').default;
    _render(React.createElement(App, null));

    await act(async () => { await Promise.resolve(); });

    const appContainer = document.querySelector('.app-container');
    expect(appContainer.className).not.toContain('has-background-image');

    _fireEvent.click(_screen.getByText('Change Background'));

    await act(async () => { await Promise.resolve(); });

    expect(appContainer.className).toContain('has-background-image');
  });

  test('should keep the base background independent of scene changes and clearing', async () => {
    const mockSettingsPanelWithBgChange = ({ onBackgroundChange }) =>
      React.createElement('button', {
        onClick: () => onBackgroundChange({
          backgroundImageUrl: 'settings-bg-url',
          backgroundOpacity: 0.3
        })
      }, 'Set Settings Background');

    mockCurrentSettingsPanel = mockSettingsPanelWithBgChange;

    const App = require('../../src/renderer/App.jsx').default;
    _render(React.createElement(App, null));

    await act(async () => { await Promise.resolve(); });
    _fireEvent.click(_screen.getByText('Set Settings Background'));
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('[data-gc-part="base-background"]').style.getPropertyValue('--app-base-background-image')).toContain('settings-bg-url');
    expect(document.querySelector('.app-background-layer-current')).toBeNull();

    await act(async () => {
      chatPanelProps.onBackgroundChange({ url: 'game-card-bg-url' });
    });
    expect(document.querySelector('.app-background-layer-current').style.backgroundImage).toContain('game-card-bg-url');
    expect(document.querySelector('.app-background-layer-previous')).toBeNull();
    await act(async () => { chatPanelProps.onBackgroundChange({ url: 'second-scene-url' }); });
    expect(document.querySelector('.app-background-layer-previous').style.backgroundImage).toContain('game-card-bg-url');
    _fireEvent.animationEnd(document.querySelector('.app-background-layer-current'));
    expect(document.querySelector('.app-background-layer-previous')).toBeNull();
    expect(document.querySelector('[data-gc-part="background-overlay"]').style.opacity).toBe('0.3');

    await act(async () => {
      chatPanelProps.onBackgroundChange({ url: 'third-scene-url' });
    });
    expect(document.querySelector('.app-background-layer-previous')).not.toBeNull();
    await act(async () => {
      chatPanelProps.onBackgroundChange({ url: null });
    });
    expect(document.querySelector('[data-gc-part="base-background"]').style.getPropertyValue('--app-base-background-image')).toContain('settings-bg-url');
    expect(document.querySelector('.app-background-layer-current')).toBeNull();
    expect(document.querySelector('.app-background-layer-previous')).toBeNull();
    expect(document.querySelector('[data-gc-part="background-overlay"]').style.opacity).toBe('0.3');
  });

  test('should apply visual panel position and scoped game card theme class', async () => {
    const App = require('../../src/renderer/App.jsx').default;
    _render(React.createElement(App, null));

    await act(async () => { await Promise.resolve(); });
    const appContainer = document.querySelector('.app-container');
    expect(appContainer.dataset.gcPart).toBe('app');
    expect(appContainer.className).toContain('game-card-visual-position-center');

    await act(async () => {
      chatPanelProps.onVisualPanelChange({ textPanel: 'right', cardId: 'White Album 2' });
    });

    expect(appContainer.className).toContain('game-card-visual-position-right');
    expect(appContainer.className).toContain('game-card-theme-white-album-2');
    await act(async () => { chatPanelProps.onVisualPanelChange({ cardId: '' }); });
    expect(appContainer.className).not.toContain('game-card-theme-white-album-2');
  });

  test('should render ChatPanel without a global registration', async () => {
    const App = require('../../src/renderer/App.jsx').default;
    _render(React.createElement(App, null));

    await act(async () => { await Promise.resolve(); });

    expect(_screen.getByText('ChatPanel Mock')).toBeInTheDocument();
  });

  test('should render SettingsPanel without a global registration', async () => {
    const App = require('../../src/renderer/App.jsx').default;
    _render(React.createElement(App, null));

    await act(async () => { await Promise.resolve(); });

    expect(_screen.getByText(/Settings:/)).toBeInTheDocument();
  });
});
