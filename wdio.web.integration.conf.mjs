import { config as webConfig } from './wdio.web.conf.mjs';

export const config = {
  ...webConfig,
  specs: ['./test/web/browser/platform.browser.js']
};
