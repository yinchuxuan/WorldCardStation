const assert = require('node:assert/strict');
const { browser, $ } = require('@wdio/globals');

async function show(options) {
  await browser.execute(options => window.visualHarness.show(options), options);
}
async function sample(selector, progress) {
  return browser.execute((selector, progress) => {
    const element = document.querySelector(selector);
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error(`Missing animation: ${selector}`);
    animation.pause();
    const { delay, duration } = animation.effect.getTiming();
    animation.currentTime = delay + Number(duration) * progress;
    return { opacity: Number(getComputedStyle(element).opacity), delay, duration };
  }, selector, progress);
}

describe('shared renderer layout and animation behavior', () => {
  beforeEach(async () => {
    await browser.url('/integration/');
    await browser.waitUntil(() => browser.execute(() => Boolean(window.visualHarness)));
  });

  it('keeps text inside the reading veil and retry clickable across layouts and themes', async () => {
    for (const [width, position, theme] of [[1200, 'center', 'light'], [1200, 'right', 'dark'],
      [1200, 'left', 'light'], [480, 'center', 'dark']]) {
      await browser.setWindowSize(width, 850);
      await show({ position, theme });
      const previousRetries = await browser.execute(() => window.visualHarness.retries);
      const user = $('.chat-message.user');
      await user.moveTo();
      await $('.retry-btn').waitForClickable();
      await $('.retry-btn').click();
      const layout = await browser.execute(() => {
        const rect = selector => {
          const { left, right, width } = document.querySelector(selector).getBoundingClientRect();
          return { left, right, width };
        };
        const bubble = document.querySelector('.assistant .chat-message-bubble');
        return { veil: rect('.chat-reading-veil'), row: rect('.chat-message-row'),
          collapsed: rect('.collapse-inner-wrapper'), viewport: innerWidth,
          color: getComputedStyle(bubble).color,
          quoteWeight: getComputedStyle(bubble.querySelector('.quoted-text')).fontWeight,
          weight: getComputedStyle(bubble).fontWeight, retries: window.visualHarness.retries };
      });
      for (const text of [layout.row, layout.collapsed]) {
        assert.ok(text.width > 0 && text.left >= 0 && text.right <= layout.viewport);
        assert.ok(text.left >= layout.veil.left - 1 && text.right <= layout.veil.right + 1);
      }
      const center = (layout.row.left + layout.row.right) / 2;
      if (position === 'right') assert.ok(center > layout.viewport / 2);
      if (position === 'left') assert.ok(center < layout.viewport / 2);
      assert.ok(Number(layout.quoteWeight) > Number(layout.weight));
      if (theme === 'dark') assert.ok(layout.color.match(/\d+/g).slice(0, 3).every(channel => Number(channel) > 150));
      assert.equal(layout.retries, previousRetries + 1);
    }
  });

  it('fades portraits after the background, changes expressions immediately and fades exits out', async () => {
    await show({ portraits: true });
    const background = '.app-background-layer-current';
    const enter = '[data-transition="enter"]';
    assert.equal((await sample(background, 0)).opacity, 0);
    const backgroundEnd = await sample(background, 1);
    assert.equal(backgroundEnd.opacity, 1);
    const start = await sample(enter, 0);
    assert.ok(start.delay >= backgroundEnd.duration);
    assert.equal(start.opacity, 0);
    const middle = await sample(enter, 0.5);
    assert.ok(middle.opacity > 0 && middle.opacity < 1);
    assert.equal((await sample(enter, 1)).opacity, 1);
    await show({ portraits: true, transition: 'expression' });
    const expression = await sample('[data-transition="expression"]', 0);
    assert.equal(expression.delay, 0);
    assert.ok(expression.duration < start.duration);
    assert.equal(expression.opacity, 0);
    assert.equal((await sample('[data-transition="expression"]', 1)).opacity, 1);
    assert.equal((await sample('[data-transition="expression-exit"]', 1)).opacity, 0);
    await show({ portraits: true, transition: 'exit' });
    assert.equal((await sample('[data-transition="exit"]', 1)).opacity, 0);
  });

  it('distributes four smaller portraits across the stage', async () => {
    await show({ portraits: true });
    const height = await $('.app-portrait-slot').getSize('height');
    await show({ portraits: true, count: 4 });
    const slots = await browser.execute(() => [...document.querySelectorAll('.app-portrait-slot')].map(element => {
      const { x, width, height } = element.getBoundingClientRect();
      return { center: x + width / 2, height };
    }));
    assert.equal(slots.length, 4);
    slots.forEach((slot, index) => {
      assert.ok(slot.height > 0 && slot.height < height);
      if (index) assert.ok(slot.center > slots[index - 1].center);
    });
  });
});
