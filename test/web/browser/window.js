const { browser, expect } = require('@wdio/globals');

async function openTab() {
  const before = await browser.getWindowHandles();
  await browser.newWindow(await browser.getUrl(), { type: 'tab' });
  // WebDriver does not guarantee handle ordering; Safari can return the old tab last.
  const added = (await browser.getWindowHandles()).filter(handle => !before.includes(handle));
  expect(added).toHaveLength(1);
  await browser.switchToWindow(added[0]);
  expect(await browser.getWindowHandle()).toBe(added[0]);
  return added[0];
}

module.exports = { openTab };
