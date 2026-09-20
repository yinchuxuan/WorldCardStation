import { mkdir, writeFile } from 'node:fs/promises';
import { startStaticServer } from './test/web/static-server.mjs';

const browserName = process.env.WEB_BROWSER || 'chrome';
if (!['chrome', 'firefox', 'safari'].includes(browserName)) throw new Error(`Unsupported WEB_BROWSER: ${browserName}`);
let server;
const output = `test-results/web/${browserName}`;
const port = Number(process.env.WEB_TEST_PORT || 1430);
export const config = {
  runner: 'local',
  specs: ['./test/web/browser/startup.browser.js'],
  maxInstances: 1,
  baseUrl: `http://127.0.0.1:${port}`,
  capabilities: [{ browserName,
    ...(browserName === 'chrome' ? { 'goog:chromeOptions': { args: ['--headless=new', '--no-sandbox'] } } : {}),
    ...(browserName === 'firefox' ? { 'moz:firefoxOptions': { args: ['-headless'] } } : {})
  }],
  logLevel: 'warn',
  outputDir: output,
  framework: 'mocha',
  reporters: ['spec'],
  waitforTimeout: 15000,
  connectionRetryCount: 0,
  mochaOpts: { timeout: 30000 },
  async onPrepare() {
    await mkdir(output, { recursive: true });
    server = await startStaticServer(port);
  },
  async afterTest(_test, _context, { passed }) {
    if (passed) return;
    const { browser } = await import('@wdio/globals');
    await browser.saveScreenshot(`${output}/failure-${Date.now()}.png`);
    const errors = await browser.execute(() => window.__startupErrors);
    await writeFile(`${output}/browser-errors.json`, JSON.stringify(errors));
  },
  async onComplete() {
    if (!server) return;
    await writeFile(`${output}/requests-${Date.now()}.json`, JSON.stringify(server.requests, null, 2));
    await server.close();
  }
};
