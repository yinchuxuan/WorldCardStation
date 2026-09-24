const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
const SettingsModelConfig = require('../../src/renderer/components/SettingsModelConfig.jsx').default;

function mount(config, isConfigured = true) {
  const onChange = jest.fn();
  render(React.createElement(SettingsModelConfig, {
    config: { protocol: 'openai', ...config }, isConfigured, onChange,
    maskApiKey: key => key ? 'masked-key' : ''
  }));
  return onChange;
}

test.each([
  ['existing URL', { apiUrl: 'https://old.example.com' }, true],
  ['empty configuration', {}, false]
])('edits %s and commits only on blur', (_label, config, configured) => {
  const onChange = mount(config, configured);
  fireEvent.click(screen.getByText(configured ? config.apiUrl : '点击设置'));
  const input = screen.getByLabelText('模型 URL');
  expect(input).toHaveValue(config.apiUrl || '');
  fireEvent.change(input, { target: { value: 'https://new.example.com/v1' } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledWith('apiUrl', 'https://new.example.com/v1');
  expect(screen.queryByLabelText('模型 URL')).not.toBeInTheDocument();
});

test.each(['', 'secret-key'])('edits an API key using a password input (initial: %s)', key => {
  const onChange = mount({ apiUrl: 'https://api.example.com', apiKey: key });
  const field = document.querySelector('[data-model-field="apiKey"]');
  fireEvent.click(field.querySelector('.settings-field-value'));
  const input = screen.getByLabelText('API Key');
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveValue(key);
  fireEvent.change(input, { target: { value: 'new-key' } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledWith('apiKey', 'new-key');
});

test('edits fractional generation parameters', () => {
  const onChange = mount({ apiUrl: 'https://api.example.com', temperature: '0.7' });
  fireEvent.click(screen.getByText('0.7'));
  const input = screen.getByLabelText('Temperature');
  expect(input).toHaveAttribute('type', 'number');
  expect(input).toHaveAttribute('step', 'any');
  fireEvent.change(input, { target: { value: '0.85' } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledWith('temperature', '0.85');
});
