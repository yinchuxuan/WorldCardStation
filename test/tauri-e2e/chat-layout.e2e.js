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
        controls: [switchButton, bgm, session].map(button => {
          const rect = button.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            width: rect.width, height: rect.height };
        }),
        header: { left: header.getBoundingClientRect().left, right: header.getBoundingClientRect().right }
      };
    });
    expect(result).not.toBeNull();
    for (const [index, control] of result.controls.entries()) {
      expect(control.width).toBeGreaterThan(0);
      expect(control.height).toBeGreaterThan(0);
      expect(control.left).toBeGreaterThanOrEqual(result.header.left);
      expect(control.right).toBeLessThanOrEqual(result.header.right);
      if (index) expect(control.left).toBeGreaterThanOrEqual(result.controls[index - 1].right);
    }
    // Controls share a row without fixing icon sizes, gaps or theme padding.
    expect(Math.max(...result.controls.map(item => item.top)))
      .toBeLessThan(Math.min(...result.controls.map(item => item.bottom)));
  });
});
