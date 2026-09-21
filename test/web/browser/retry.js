const { browser, $ } = require('@wdio/globals');

async function retryTurn() {
  const error = $('button[aria-label="关闭请求错误"]');
  if (await error.isExisting()) await error.click();
  const source = $('.retry-source-row .chat-message.user');
  await source.scrollIntoView({ block: 'center', inline: 'nearest' });
  await $('[data-gc-part="chat-history"]').moveTo();
  await browser.waitUntil(() => browser.execute(() =>
    getComputedStyle(document.querySelector('.chat-header')).visibility === 'hidden'),
  { timeoutMsg: 'Floating header did not hide before retry' });
  // Short histories cannot scroll to the viewport centre. Their first row can
  // overlap the header, so approach the exposed bottom edge rather than its centre.
  const sourceSize = await source.getSize();
  await source.moveTo({ yOffset: Math.floor(sourceSize.height / 2) - 5 });
  const retry = $('.retry-source-row button[title="重新生成"]');
  await retry.waitForDisplayed();
  const y = Math.floor((await retry.getSize()).height / 2) - 5;
  await retry.moveTo({ yOffset: y });
  await retry.click({ y });
}

module.exports = { retryTurn };
