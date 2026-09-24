import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { startStaticServer } from './test/web/static-server.mjs';
import { startModelServer } from './test/web/model-server.mjs';

const browserName = process.env.WEB_BROWSER || 'chrome';
if (!['chrome', 'firefox', 'safari'].includes(browserName)) throw new Error(`Unsupported WEB_BROWSER: ${browserName}`);
let server, modelServer;
const output = `test-results/web/${browserName}`;
const port = Number(process.env.WEB_TEST_PORT || 1430);
export const config = {
  runner: 'local',
  specs: ['./test/web/browser/startup.browser.js', './test/web/browser/catalog.browser.js', './test/web/browser/gameplay.browser.js',
    './test/web/browser/sessions.browser.js', './test/web/browser/session-playback.browser.js',
    './test/web/browser/session-failures.browser.js', './test/web/browser/resource-lifecycle.browser.js', './test/web/browser/runtime-card.browser.js'],
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
    modelServer = await startModelServer(port + 1);
  },
  async afterTest(test, _context, { passed, error }) {
    if (passed) return;
    const message = `${test.fullTitle || test.title}: ${error?.stack || error?.message || 'Test failed'}`;
    await writeFile(`${output}/failed-test-${Date.now()}.json`, JSON.stringify({ message }));
    const { browser } = await import('@wdio/globals');
    await browser.saveScreenshot(`${output}/failure-${Date.now()}.png`);
    const errors = await browser.execute(() => window.__startupErrors);
    await writeFile(`${output}/browser-errors.json`, JSON.stringify(errors ?? []));
  },
  async onComplete() {
    // Emit in the launcher: worker output gets a prefix that hides workflow commands.
    if (process.env.GITHUB_ACTIONS) {
      for (const file of (await readdir(output)).filter(name => name.startsWith('failed-test-'))) {
        const { message } = JSON.parse(await readFile(`${output}/${file}`, 'utf8'));
        console.error(`::error::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
      }
    }
    if (!server) return;
    await writeFile(`${output}/requests-${Date.now()}.json`, JSON.stringify(server.requests, null, 2));
    await server.close();
    await writeFile(`${output}/model-requests-${Date.now()}.json`, JSON.stringify(modelServer.requests, null, 2));
    await modelServer.close();
  }
};
