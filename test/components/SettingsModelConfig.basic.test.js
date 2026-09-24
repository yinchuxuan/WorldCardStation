const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
const SettingsModelConfig = require('../../src/renderer/components/SettingsModelConfig.jsx').default;

test('shows the saved model summary without exposing the API key', () => {
  const config = {
    apiUrl: 'https://api.example.com/v1', apiKey: 'secret-key', modelName: 'model-1',
    protocol: 'openai', maxTokens: '2048', temperature: '0.8', topP: '0.9',
    frequencyPenalty: '0.2', presencePenalty: '0.4'
  };
  render(React.createElement(SettingsModelConfig, {
    config, onChange: jest.fn(), maskApiKey: () => 'masked-key', isConfigured: true
  }));
  for (const text of [config.apiUrl, config.modelName, 'masked-key', '已配置'])
    expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.queryByText(config.apiKey)).not.toBeInTheDocument();
  // Check field/value associations, not only the presence of their labels.
  for (const [label, value] of [
    ['最大输出', '2048'], ['Temperature', '0.8'], ['Top P', '0.9'],
    ['频率惩罚', '0.2'], ['存在惩罚', '0.4']
  ]) {
    fireEvent.click(screen.getByText(value));
    expect(screen.getByLabelText(label)).toHaveValue(Number(value));
    fireEvent.blur(screen.getByLabelText(label));
  }
});
