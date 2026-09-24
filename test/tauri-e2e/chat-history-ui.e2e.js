/* global browser, $, $$ */

const {
  refreshApp, resetNoCard, saveHistory, toggleHistory
} = require('./support/tauri');

const MULTI_TURN = [
  { role: 'user', content: 'What is React?' },
  { role: 'assistant', content: 'React is a JavaScript library for building UIs.' },
  { role: 'user', content: 'How do hooks work?' },
  { role: 'assistant', content: 'Hooks let you use state in functional components.' },
  { role: 'user', content: 'Show me useEffect' }
];

async function inject(messages) {
  await saveHistory(messages);
  await refreshApp();
}

describe('Tauri collapsed message history', () => {
  beforeEach(async () => {
    await resetNoCard();
  });

  it('should hide earlier messages behind a collapsed indicator', async () => {
    await inject(MULTI_TURN);
    await expect($('.collapsed-history-indicator')).toExist();
    await expect($('.collapsed-history-indicator'))
      .toHaveText(expect.stringContaining('条更早的消息'));
    expect((await $$('.collapsed-history .chat-message')).length).toBe(0);
  });

  it('should pin the last user message above a divider', async () => {
    await inject(MULTI_TURN);
    const result = await browser.execute(() => {
      const wrapper = document.querySelector('.collapse-inner-wrapper');
      const first = wrapper?.querySelector(':scope > .chat-message-row .chat-message');
      return {
        role: first?.classList.contains('user') ? 'user' : 'other',
        text: first?.textContent || '',
        divider: Boolean(document.querySelector('.pinned-divider'))
      };
    });
    expect(result).toEqual(expect.objectContaining({ role: 'user', divider: true }));
    expect(result.text).toContain('Show me useEffect');
  });

  it('should expand history after repeated upward wheel gestures', async () => {
    await inject(MULTI_TURN);
    await browser.execute(() => {
      const view = document.querySelector('.collapsed-message-view');
      for (let index = 0; index < 5; index += 1) {
        view.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
      }
    });
    await browser.waitUntil(async () => (
      (await $('.collapsed-message-view').getAttribute('class')).includes('expanded')
    ));
    expect((await $$('.collapsed-message-view .chat-message-row')).length).toBeGreaterThan(1);
  });

  it('should position the assistant response after the pinned user message', async () => {
    await inject([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: 'It is 4.' }
    ]);
    const visible = await browser.execute(() => (
      [...document.querySelectorAll('.collapse-inner-wrapper > .chat-message-row')]
        .map(row => {
          const message = row.querySelector('.chat-message');
          return message && {
            role: message.classList.contains('user') ? 'user' : 'assistant',
            content: message.textContent.trim()
          };
        }).filter(Boolean)
    ));
    expect(visible[0]).toEqual(expect.objectContaining({ role: 'user' }));
    expect(visible[0].content).toContain('2+2');
    expect(visible[1]).toEqual(expect.objectContaining({ role: 'assistant' }));
    expect(visible[1].content).toContain('4');
  });
});

describe('Tauri message history JSON view', () => {
  beforeEach(async () => {
    await resetNoCard();
  });

  it('should render saved messages in the history card', async () => {
    await inject([
      { role: 'user', content: 'Hello E2E' },
      { role: 'assistant', content: 'E2E Response' }
    ]);
    await toggleHistory();
    const parsed = JSON.parse(await $('.msg-history-json').getText());
    expect(parsed).toHaveProperty('msgs');
    expect(parsed.msgs).toHaveLength(2);
  });

  it('should show an empty state with no messages', async () => {
    await inject([]);
    await toggleHistory();
    await expect($('.chat-history')).toHaveText(expect.stringContaining('暂无消息历史记录'));
  });

  it('should include TTL system messages in history JSON', async () => {
    await inject([
      { role: 'system', content: 'temporary rules', ttl: 1 },
      { role: 'user', content: 'Hello E2E' }
    ]);
    await toggleHistory();
    const parsed = JSON.parse(await $('.msg-history-json').getText());
    expect(parsed.msgs[0]).toEqual({ id: expect.any(String), role: 'system', content: 'temporary rules', ttl: 1 });
  });
});
