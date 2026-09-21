/* global browser, $ */

const {
  resetNoCard, revealHeader, toggleHistory
} = require('./support/tauri');

describe('Tauri chat panel UI', () => {
  beforeEach(async () => {
    await resetNoCard();
  });

  it('should toggle to message history and back through the header', async () => {
    await toggleHistory();
    await expect($('.header-title')).toHaveText('msg历史记录');
    await expect($('.chat-history')).toHaveText(expect.stringContaining('暂无消息历史记录'));
    await toggleHistory();
    await expect($('.game-card-title-name')).toHaveText('普通聊天');
  });

  it('should enable native vertical scrolling for chat history', async () => {
    expect(await $('.chat-history').getCSSProperty('overflow-y')).toMatchObject({ value: 'auto' });
  });

  it('should keep session, game card and BGM controls in the title control', async () => {
    await revealHeader();
    // Measure final geometry, not the parent panel's scale-in animation.
    await browser.execute(async () => {
      await Promise.all(document.querySelector('.chat-panel').getAnimations()
        .map(animation => animation.finished));
    });
    const result = await browser.execute(() => {
      const title = document.querySelector('.game-card-title-control');
      const actions = title?.querySelector('.game-card-title-actions');
      const bgm = actions?.querySelector('.game-card-bgm-btn');
      const session = actions?.querySelector('.chat-session-btn');
      const switchButton = title?.querySelector('.game-card-title-main');
      const header = document.querySelector('.chat-header');
      if (!title || !bgm || !session || !switchButton || !header) return null;
      return {
        bgmIcon: bgm.textContent.trim(),
        vertical: [bgm, session, switchButton].map(button => {
          const rect = button.getBoundingClientRect();
          return { height: rect.height, center: rect.top + rect.height / 2 };
        }),
        gap: Math.round(session.getBoundingClientRect().left - bgm.getBoundingClientRect().right),
        paddingRight: getComputedStyle(title).paddingRight,
        rightGap: Math.round(header.getBoundingClientRect().right
          - session.getBoundingClientRect().right)
      };
    });
    expect(result).not.toBeNull();
    expect(result.bgmIcon).toBe('music_note');
    expect(result.gap).toBeGreaterThanOrEqual(0);
    expect(result.gap).toBeLessThanOrEqual(12);
    expect(result.paddingRight).toBe('54px');
    expect(result.rightGap).toBeGreaterThanOrEqual(70);
    // The split card-name button has a 44px hit area; the two icon controls are 40px.
    expect(result.vertical.map(item => item.height)).toEqual([40, 40, 44]);
    expect(Math.max(...result.vertical.map(item => item.center))
      - Math.min(...result.vertical.map(item => item.center))).toBeLessThanOrEqual(0.5);
  });
});
