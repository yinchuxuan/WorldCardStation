/* global browser, $ */

const { invoke, refreshApp } = require('./support/tauri');

const LOCAL_BACKGROUND_URL = 'local://user-background/current';

async function authorizeAndSave(opacity) {
  expect(await invoke('select_background_image')).toBe(LOCAL_BACKGROUND_URL);
  return invoke('save_background_config', { config: {
    backgroundImageUrl: LOCAL_BACKGROUND_URL,
    backgroundOpacity: opacity
  } });
}

describe('Tauri background settings', () => {
  beforeEach(async () => {
    await invoke('save_background_config', { config: {
      backgroundImageUrl: '', backgroundOpacity: 0.5
    } });
  });

  it('should show the background settings section and header', async () => {
    await $('.settings-trigger-zone').moveTo();
    await expect($('.background-settings-section')).toBeDisplayed();
    await expect($('.background-settings-header')).toExist();
    await expect($('.background-label')).toHaveText(expect.stringContaining('背景图片'));
    await expect($('.config-summary-card, .config-empty-state')).toExist();
  });

  it('should authorize and save a user background through Tauri', async () => {
    expect(await authorizeAndSave(0.7)).toEqual({
      backgroundImageUrl: LOCAL_BACKGROUND_URL,
      backgroundOpacity: 0.7
    });
    expect(await invoke('get_background_config')).toEqual({
      backgroundImageUrl: LOCAL_BACKGROUND_URL,
      backgroundOpacity: 0.7
    });
  });

  it('should apply and remove the background class after config events', async () => {
    await authorizeAndSave(0.5);
    await browser.waitUntil(async () => (
      (await $('.app-container').getAttribute('class')).includes('has-background-image')
    ));
    expect(await $('[data-gc-part="base-background"]').getAttribute('style')).toContain('url');

    await invoke('save_background_config', { config: {
      backgroundImageUrl: '', backgroundOpacity: 0.5
    } });
    await browser.waitUntil(async () => (
      !(await $('.app-container').getAttribute('class')).includes('has-background-image')
    ));
    expect(await $('[data-gc-part="base-background"]').getAttribute('style')).toContain('none');
  });

  it('should persist a user background across application restart', async () => {
    await authorizeAndSave(0.8);
    await refreshApp();
    expect(await invoke('get_background_config')).toEqual({
      backgroundImageUrl: LOCAL_BACKGROUND_URL,
      backgroundOpacity: 0.8
    });
    await browser.waitUntil(async () => (
      (await $('.app-container').getAttribute('class')).includes('has-background-image')
    ));
  });
});
