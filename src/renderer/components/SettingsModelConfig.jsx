import React from 'react';
import { reasoningEffortsForProtocol } from '../chat/modelGenerationParams.js';
import { PropTypes } from './componentPropTypes.js';

const EFFORT_LABELS = {
  none: '无（none）', minimal: '极低（minimal）', low: '低（low）',
  medium: '中（medium）', high: '高（high）', xhigh: '极高（xhigh）', max: '最大（max）'
};
const CONNECTION_LABELS = {
  testing: '连接中…', success: '已连接', error: '连接失败'
};

function selectOptions(field, protocol) {
  if (field === 'protocol') {
    return [{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }];
  }
  if (field === 'reasoningEffort') {
    return [
      { value: '', label: '模型默认' },
      ...reasoningEffortsForProtocol(protocol).map(value => ({ value, label: EFFORT_LABELS[value] }))
    ];
  }
  return null;
}

function SettingsModelConfig({
  config,
  onChange,
  onTestConnection,
  maskApiKey,
  isConfigured
}) {
  const [editingField, setEditingField] = React.useState(null);
  const [tempValue, setTempValue] = React.useState('');
  const [testResult, setTestResult] = React.useState(null);
  const testRunRef = React.useRef(0);
  const hasConnectionConfig = ['apiUrl', 'apiKey', 'modelName']
    .every(field => String(config[field] || '').trim());
  const connectionLabel = CONNECTION_LABELS[testResult?.status] || '已配置';
  const connectionTitle = testResult?.status === 'error'
    ? testResult.message
    : '发送一条极短消息验证完整生成链路，可能消耗少量额度';

  React.useEffect(() => {
    testRunRef.current += 1;
    setTestResult(null);
  }, [config.apiUrl, config.apiKey, config.modelName, config.protocol]);

  const startEdit = (field) => {
    const options = selectOptions(field, config.protocol);
    const value = config[field] ?? '';
    setEditingField(field);
    setTempValue(options?.some(option => option.value === value) ? value : (options?.[0].value ?? value));
  };

  const finishEdit = () => {
    if (editingField) {
      onChange(editingField, tempValue);
    }
    setEditingField(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const handleTestConnection = async () => {
    if (!hasConnectionConfig || editingField || !onTestConnection) return;
    const run = ++testRunRef.current;
    setTestResult({ status: 'testing', message: '' });
    try {
      await onTestConnection();
      if (run === testRunRef.current) {
        setTestResult({ status: 'success', message: '' });
      }
    } catch (error) {
      if (run === testRunRef.current) {
        setTestResult({ status: 'error', message: error?.message || '连接失败' });
      }
    }
  };

  const renderField = (field, label, icon, type = 'text', placeholder = '') => {
    const isEditing = editingField === field;
    const options = selectOptions(field, config.protocol);
    const selectedOption = options?.find(option => option.value === config[field]);
    const displayValue = field === 'apiKey'
      ? (maskApiKey(config[field]) || '未设置')
      : (selectedOption?.label || (options ? options[0].label : config[field]) || '未设置');

    return (
      <div className="settings-field-inline" data-model-field={field}>
        <span className="settings-field-label">
          <span className="material-icons">{icon}</span>
          {label}
        </span>
        {isEditing ? (
          options ? (
            <select
              aria-label={label}
              className="md-input settings-inline-input"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={handleKeyDown}
              autoFocus
            >
              {options.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              aria-label={label}
              type={type}
              className="md-input settings-inline-input"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              step={type === 'number' ? 'any' : undefined}
              autoFocus
            />
          )
        ) : (
          <span
            className="settings-field-value"
            onClick={() => startEdit(field)}
          >
            {displayValue}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="model-config-section">
      <div className="model-config-header">
        <span className="material-icons">smart_toy</span>
        <span className="model-label">模型配置</span>
        {isConfigured ? (
          <button
            type="button"
            className={`config-status configured model-connection-status ${testResult?.status || ''}`}
            disabled={!hasConnectionConfig || Boolean(editingField) || testResult?.status === 'testing' || !onTestConnection}
            onClick={handleTestConnection}
            title={connectionTitle}
            aria-label={testResult?.status === 'error' ? `${connectionLabel}：${testResult.message}` : connectionLabel}
          >
            {connectionLabel}
          </button>
        ) : null}
      </div>
      {!isConfigured && !editingField ? (
        <div
          className="config-empty-state background-clickable-empty"
          onClick={() => startEdit('apiUrl')}
          title="点击设置模型配置"
        >
          <span className="material-icons">settings_suggest</span>
          <div>尚未配置模型</div>
          <div className="config-add-hint">
            <span className="material-icons">add</span>
            <span>点击设置</span>
          </div>
        </div>
      ) : (
        <div className="config-summary-card">
          {renderField('apiUrl', '模型 URL', 'link', 'text', 'https://api.example.com/v1')}
          {renderField('apiKey', 'API Key', 'key', 'password', '输入您的 API Key')}
          {renderField('protocol', '协议类型', 'settings_ethernet')}
          {renderField('modelName', '模型名称', 'smart_toy', 'text', 'model-name')}
          {renderField('reasoningEffort', '推理强度', 'psychology')}
          {renderField('maxTokens', '最大输出', 'short_text', 'number', '50000')}
          {renderField('temperature', 'Temperature', 'device_thermostat', 'number', '1')}
          {renderField('topP', 'Top P', 'filter_alt', 'number', '1')}
          {renderField('frequencyPenalty', '频率惩罚', 'repeat', 'number', '0')}
          {renderField('presencePenalty', '存在惩罚', 'person_search', 'number', '0')}
        </div>
      )}
    </div>
  );
}

SettingsModelConfig.propTypes = {
  config: PropTypes.shape({ apiUrl: PropTypes.string, apiKey: PropTypes.string, modelName: PropTypes.string, protocol: PropTypes.string }).isRequired,
  onChange: PropTypes.func.isRequired,
  onTestConnection: PropTypes.func,
  maskApiKey: PropTypes.func.isRequired,
  isConfigured: PropTypes.oneOfType([PropTypes.bool, PropTypes.string])
};

export default SettingsModelConfig;
