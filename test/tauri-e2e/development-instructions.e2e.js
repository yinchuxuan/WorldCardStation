/* global browser, $, after */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { invoke, refreshApp } = require('./support/tauri');

async function clickCopy() {
  await $('.settings-trigger-zone').moveTo();
  const button = $('.settings-development button');
  await button.scrollIntoView();
  await button.click();
  await $('.settings-development-result').waitForExist();
}

describe('Game card development bootstrap', () => {
  beforeEach(async () => refreshApp());
  after(async () => refreshApp());

  for (const theme of ['light', 'dark']) {
    it(`matches preceding section headings in ${theme} mode`, async () => {
      const styles = await browser.execute(value => {
        document.documentElement.setAttribute('data-theme', value);
        const read = (selector, properties) => {
          const style = getComputedStyle(document.querySelector(selector));
          return properties.map(property => style.getPropertyValue(property));
        };
        const title = ['color', 'font-size', 'font-weight', 'font-family'];
        const icon = ['color', 'font-size'];
        const header = ['display', 'align-items', 'gap', 'margin-bottom'];
        const section = ['margin-top', 'padding-top', 'border-top'];
        return {
          titles: ['.background-label', '.model-label', '.settings-development h3'].map(s => read(s, title)),
          icons: ['.background-settings-header', '.model-config-header', '.settings-development h3']
            .map(s => read(`${s} .material-icons`, icon)),
          headers: ['.background-settings-header', '.model-config-header', '.settings-development h3']
            .map(s => read(s, header)),
          sections: ['.background-settings-section', '.model-config-section', '.settings-development']
            .map(s => read(s, section))
        };
      }, theme);
      for (const values of Object.values(styles)) {
        expect(values[2]).toEqual(values[0]);
        expect(values[2]).toEqual(values[1]);
      }
      await $('.settings-trigger-zone').moveTo();
      await browser.execute(() => {
        const content = document.querySelector('.settings-content');
        content.style.scrollBehavior = 'auto';
        content.scrollTop = content.scrollHeight;
      });
      await browser.saveScreenshot(path.resolve(`test-results/tauri-e2e/development-${theme}.png`));
    });
  }

  it('renders local development and copy icons instead of generic placeholders', async () => {
    const icons = await browser.execute(() => (
      [...document.querySelectorAll('.settings-development .material-icons')].map(element => {
        const style = getComputedStyle(element);
        const mask = style.getPropertyValue('--icon-mask').trim();
        return {
          name: element.dataset.icon,
          local: mask.includes('data:image/svg+xml'),
          placeholder: mask === style.getPropertyValue('--icon-generic').trim(),
          size: style.fontSize
        };
      })
    ));
    expect(icons).toEqual([
      { name: 'code', local: true, placeholder: false, size: '20px' },
      { name: 'content_copy', local: true, placeholder: false, size: '20px' }
    ]);
  });

  it('provides existing native executable/docs without mutating cards, sessions or config', async () => {
    const commands = ['get_game_cards', 'list_chat_sessions', 'get_model_config'];
    const before = await Promise.all(commands.map(command => invoke(command)));
    const text = await invoke('get_game_card_development_instructions');
    const locations = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)[1]);
    for (const field of ['executable', 'guidePath', 'specIndexPath', 'librariesIndexPath']) {
      expect(path.isAbsolute(locations[field])).toBe(true);
      expect(fs.statSync(locations[field]).isFile()).toBe(true);
    }
    expect(text).toContain('--init-project');
    expect(text).toContain('--lib worldbook');
    expect(text).toContain('--dry-run');
    expect(text).toContain('.wcs/development.md');
    expect(await Promise.all(commands.map(command => invoke(command)))).toEqual(before);
  });

  it('runs offline syntax checks while the existing GUI and its data remain unchanged', async () => {
    const text = await invoke('get_game_card_development_instructions');
    const { executable } = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)[1]);
    const commands = ['get_game_cards', 'list_chat_sessions', 'get_model_config', 'get_chat_history'];
    const before = await Promise.all(commands.map(command => invoke(command)));
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-dry-run-e2e-'));
    try {
      const launch = args => JSON.parse(execFileSync(executable, args, {
        cwd: project, env: { ...process.env, PATH: '' }, timeout: 40000, encoding: 'utf8'
      }));
      expect(launch(['--init-project', '.', '--lib', 'worldbook']).ok).toBe(true);
      const card = fs.readFileSync(path.join(project, 'card.json'), 'utf8');
      const report = launch(['--dry-run', '.']);
      expect(report.status).toBe('valid');
      expect(report.checked).toContain('javascript_syntax');
      expect(report).not.toHaveProperty('tracePath');
      expect(fs.readFileSync(path.join(project, 'card.json'), 'utf8')).toBe(card);
      expect(fs.existsSync(path.join(project, 'sessions'))).toBe(false);
      await expect($('.app-container')).toExist();
      expect(await Promise.all(commands.map(command => invoke(command)))).toEqual(before);
    } finally {
      fs.rmSync(project, { recursive: true });
    }
  });

  it('supports the real WebView clipboard or offers complete manual text if denied', async () => {
    const expected = await invoke('get_game_card_development_instructions');
    await clickCopy();
    const result = $('.settings-development-result');
    const message = await result.getText();
    expect(['已复制，请粘贴到 agent 对话中', '无法自动复制，请手动复制下方指令']).toContain(message);
    if (message.includes('手动')) {
      expect(await $('.settings-development textarea').getValue()).toBe(expected);
    }
    console.log(`Native clipboard result: ${message}`);
  });

  it('passes the full native instructions to clipboard and reports completion', async () => {
    const expected = await invoke('get_game_card_development_instructions');
    await browser.execute(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { window.__developmentCopiedText = text; }
      } });
    });
    await clickCopy();
    await expect($('.settings-development-result')).toHaveText('已复制，请粘贴到 agent 对话中');
    expect(await browser.execute(() => window.__developmentCopiedText)).toBe(expected);
    await expect($('.settings-development textarea')).not.toExist();
  });

  it('shows selectable native instructions on denied clipboard access', async () => {
    const expected = await invoke('get_game_card_development_instructions');
    await browser.execute(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { throw new Error('clipboard denied'); }
      } });
    });
    await clickCopy();
    await expect($('.settings-development-result')).toHaveText('无法自动复制，请手动复制下方指令');
    const text = $('.settings-development textarea');
    expect(await text.getValue()).toBe(expected);
    await text.scrollIntoView();
    await text.click();
    expect(await browser.execute(() => {
      const element = document.querySelector('.settings-development textarea');
      return [element.selectionStart, element.selectionEnd, element.readOnly];
    })).toEqual([0, expected.length, true]);
  });
});
