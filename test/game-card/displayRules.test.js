const { render } = require('@testing-library/react');
const DOMPurify = require('dompurify')(window);
const { marked } = require('marked');
const displayRules = require('../../src/renderer/gameCard/displayRules');
const renderers = require('../../src/renderer/components/ChatPanelMessageRenderers').default;

describe('game card display rules', () => {
  test('hides assistant summary blocks without changing the source content', () => {
    const content = '「来了。」\n<summary>hidden state</summary>';
    const display = {
      assistant: [{
        id: 'hide-summary',
        stage: 'before_markdown',
        type: 'regex_replace',
        pattern: '<summary>[\\s\\S]*?<\\/summary>',
        flags: 'g',
        replace: ''
      }]
    };

    expect(displayRules.applyAssistantDisplayRules(content, display).trim()).toBe('「来了。」');
    expect(content).toContain('<summary>hidden state</summary>');
  });

  test('supports capture groups for display-only HTML enrichment', () => {
    const display = {
      assistant: [{
        stage: 'before_markdown',
        type: 'regex_replace',
        pattern: '^【(.+?)】$',
        flags: 'gm',
        replace: '<div class="rp-speaker">$1</div>'
      }]
    };

    expect(displayRules.applyAssistantDisplayRules('【雪菜】\n「你来了。」', display))
      .toContain('<div class="rp-speaker">雪菜</div>');
  });

  test('applies user rules independently from assistant rules', () => {
    const display = {
      user: [{
        stage: 'before_markdown',
        type: 'regex_replace',
        pattern: '\\n*<hidden>[\\s\\S]*?<\\/hidden>',
        flags: 'g',
        replace: ''
      }]
    };

    expect(displayRules.applyUserDisplayRules('玩家输入\n<hidden>prompt</hidden>', display))
      .toBe('玩家输入');
    expect(displayRules.applyAssistantDisplayRules('玩家输入\n<hidden>prompt</hidden>', display))
      .toContain('prompt');
  });

  test('user renderer applies rules before markdown rendering', () => {
    const element = renderers.renderUserMsg({ msg: { role: 'user', content: 'Hello **there**\n<hidden>prompt</hidden>' }, marked, DOMPurify,
      highlightQuotes: value => value,
      display: {
        user: [{
          stage: 'before_markdown',
          type: 'regex_replace',
          pattern: '\\n*<hidden>[\\s\\S]*?<\\/hidden>',
          flags: 'g',
          replace: ''
        }]
      } });

    const { container } = render(element);
    const html = container.querySelector('.chat-bubble-content').innerHTML;
    expect(html).toContain('<strong>there</strong>');
    expect(html).not.toContain('prompt');
  });

  test('skips invalid flags and unsupported stages', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const display = {
      assistant: [
        { stage: 'before_markdown', type: 'regex_replace', pattern: 'x', flags: 'y', replace: 'bad' },
        { stage: 'after_markdown', type: 'regex_replace', pattern: 'x', flags: 'g', replace: 'bad' }
      ]
    };

    expect(displayRules.applyAssistantDisplayRules('x', display)).toBe('x');
    warn.mockRestore();
  });

  test('assistant renderer applies rules before markdown rendering', () => {
    const element = renderers.renderAssistantMsg({ msg: { role: 'assistant', content: 'Hello **there**\n<summary>hidden</summary>' }, idx: 0, isStreaming: false,
      tw: null, currentThinking: '', showStreamThinking: false, setShowStreamThinking: jest.fn(),
      toggleThinkingForMessage: jest.fn(), marked, DOMPurify, highlightQuotes: value => value,
      display: {
        assistant: [{
          stage: 'before_markdown',
          type: 'regex_replace',
          pattern: '<summary>[\\s\\S]*?<\\/summary>',
          flags: 'g',
          replace: ''
        }]
      } });

    const { container } = render(element);
    const html = container.querySelector('.chat-bubble-content').innerHTML;
    expect(html).toContain('<strong>there</strong>');
    expect(html).not.toContain('hidden');
  });
});
