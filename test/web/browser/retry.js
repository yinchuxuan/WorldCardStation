const { browser, $ } = require('@wdio/globals');

async function retryTurn() {
  const error = $('button[aria-label="关闭请求错误"]');
  if (await error.isExisting()) await error.click();
  const source = $('.retry-source-row .chat-message');
  await source.scrollIntoView({ block: 'center', inline: 'nearest' });
  await $('[data-gc-part="chat-history"]').moveTo();
  await browser.waitUntil(() => browser.execute(() =>
    ['.chat-header', '.chat-input-area'].every(selector =>
      getComputedStyle(document.querySelector(selector)).visibility === 'hidden')),
  { timeoutMsg: 'Floating controls did not hide before retry' });
  // Short histories cannot always centre the source. Approach the edge facing
  // the viewport centre to avoid both the header and input hover triggers.
  const direction = await browser.execute(() => {
    const rect = document.querySelector('.retry-source-row .chat-message').getBoundingClientRect();
    return rect.top + rect.height / 2 < innerHeight / 2 ? 1 : -1;
  });
  const sourceSize = await source.getSize();
  await source.moveTo({ yOffset: direction * (Math.floor(sourceSize.height / 2) - 5) });
  const retry = $('.retry-source-row button[title="重新生成"]');
  await retry.waitForDisplayed();
  const y = direction * (Math.floor((await retry.getSize()).height / 2) - 5);
  await retry.moveTo({ yOffset: y });
  await retry.click({ y });
}

module.exports = { retryTurn };
