import React from 'react';
import SettingsBackground from './SettingsBackground.jsx';
import SettingsModelConfig from './SettingsModelConfig.jsx';
import SettingsGameCardDevelopment from './SettingsGameCardDevelopment.jsx';
import useSettingsState from '../settings/useSettingsState.js';
import { PropTypes } from './componentPropTypes.js';
import { capabilities } from '../platform/index.js';

function SettingsPanel({ onToggleTheme, theme, onBackgroundChange }) {
  const [visible, setVisible] = React.useState(false);
  const state = useSettingsState(onBackgroundChange);
  const {
    config, backgroundConfig, isConfigured, maskApiKey,
    handleBackgroundChange, handleSelectBackgroundImage, handleClearBackgroundImage,
    handleChange, handleTestConnection
  } = state;

  const handleMouseEnter = () => setVisible(true);
  const handleMouseLeave = () => setVisible(false);

  return (
    <div className="settings-trigger-zone" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className={`settings-panel ${visible ? 'visible' : ''}`}>
        <div className="settings-header">
          <span className="material-icons">settings</span>
          <span className="settings-title">系统配置</span>
        </div>
        <div className="settings-content">
          <div className="theme-toggle-section">
            <div className="theme-toggle-header">
              <span className="material-icons">palette</span>
              <span className="theme-label">外观模式</span>
            </div>
            <button className="md-btn md-btn-tonal theme-toggle-btn" onClick={onToggleTheme}>
              <span className="material-icons">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
              <span>{theme === 'dark' ? '切换到浅色' : '切换到深色'}</span>
            </button>
          </div>
          <SettingsBackground
              backgroundConfig={backgroundConfig}
              onBackgroundChange={handleBackgroundChange}
              onSelectBackgroundImage={handleSelectBackgroundImage}
              onClearBackgroundImage={handleClearBackgroundImage}
          />
          <SettingsModelConfig
              config={config}
              onChange={handleChange}
              onTestConnection={handleTestConnection}
              maskApiKey={maskApiKey}
              isConfigured={isConfigured}
          />
          {capabilities?.localDevelopment !== false && <SettingsGameCardDevelopment />}
          {state.error && <p role="alert">{state.error.message}</p>}
        </div>
      </div>
    </div>
  );
}

SettingsPanel.propTypes = {
  onToggleTheme: PropTypes.func.isRequired,
  theme: PropTypes.string.isRequired,
  onBackgroundChange: PropTypes.func
};

export default SettingsPanel;
