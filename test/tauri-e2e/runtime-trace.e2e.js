/* global browser, $, before, after */
const fs = require('node:fs');
const path = require('node:path');
const { card } = require('./support/cards');
const { StreamServer } = require('./support/streamServer');
const { activateCard, invoke, revealHeader, sendMessage, waitForHistory } = require('./support/tauri');

const dataDir = path.resolve('test-results/tauri-e2e/data/game-cards/cards');
const tracePath = (id, session = 'default') => path.join(dataDir, id, 'sessions', session, 'trace.jsonl');
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

async function mode(enabled) {
  const button = $('.chat-header [aria-label="开发者模式"]');
  await revealHeader();
  await button.waitForClickable();
  if ((await button.getAttribute('aria-pressed')) !== String(enabled)) await button.click();
  await browser.waitUntil(async () => await button.isEnabled()
    && (await button.getAttribute('aria-pressed')) === String(enabled));
  if (enabled) await expect(button).toHaveAttribute('data-state', 'recording');
}

async function currentTrace() {
  const text = await invoke('get_game_card_development_instructions');
  const { gameCardsPath } = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)[1]);
  const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const cardId = json(path.join(gameCardsPath, 'active.json')).id;
  const root = path.join(gameCardsPath, 'cards', cardId, 'sessions');
  const sessionId = json(path.join(root, 'active.json')).id;
  const session = json(path.join(root, 'index.json')).sessions.find(item => item.id === sessionId);
  return { cardId, session, file: path.join(root, sessionId, 'trace.jsonl') };
}

async function waitEvent(file, type) {
  await browser.waitUntil(() => read(file).some(event => event.type === type));
  return read(file);
}

describe('Developer mode runtime trace', () => {
  let server;
  before(async () => { server = await new StreamServer().start(); });
  after(async () => { await mode(false); server.close(); });
  beforeEach(async () => {
    server.reset();
    await invoke('save_model_config', { config: {
      apiUrl: server.url, apiKey: 'NEVER-LOG-THIS-TRACE-KEY', modelName: 'trace-model', protocol: 'openai'
    } });
  });

  it('records imported rule sources, full hidden mutations, Worker reads/effects and actual model messages', async () => {
    const id = 'runtime-trace-flow';
    const rules = [{ when: { phase: 'pre_send' }, then: [
      { type: 'insert', role: 'system', content: 'transient secret body', ttl: 1, _meta: { visibility: 'llm_only', source: 'trace' } },
      { type: 'remove', predicate: { '_meta.source': 'trace' } },
      { type: 'exec', sourceFile: 'main.js', args: { score: 3 } }
    ] }, { when: { phase: 'after_response' }, then: [
      { type: 'replace', predicate: { role: 'assistant' }, content: 'changed {{original_content}}' }
    ] }];
    await activateCard(card(id, 'Trace Flow', [{ $import: 'rules.json' }], { files: { entry: 'entry.md' } }), {
      'rules.json': JSON.stringify(rules), 'entry.md': 'real entry',
      'main.js': 'function run(ctx) { ctx.state.score = ctx.args.score; ctx.messages[0].content = ctx.files.read("entry"); return { messages: ctx.messages, state: ctx.state, effects: { selected: [1] } }; }'
    });
    expect(fs.existsSync(tracePath(id))).toBe(false);
    await mode(true);
    const titleButton = $('[aria-label="切换游戏卡"]');
    await expect(titleButton).toHaveAttribute('aria-expanded', 'false');
    await expect($('.runtime-trace-toggle [data-gc-part="game-card-title-icon"]')).toExist();
    await expect($('.game-card-title-main [data-gc-part="game-card-title-icon"]')).not.toExist();
    await expect($('.game-card-title-main .material-icons')).not.toExist();
    await titleButton.click();
    await expect(titleButton).toHaveAttribute('aria-expanded', 'true');
    await expect($('.runtime-trace-toggle')).toHaveAttribute('aria-pressed', 'true');
    await titleButton.click();
    server.queueOpenAi('original answer');
    await sendMessage('question');
    const history = await waitForHistory(value => value.messages.some(message => message.content === 'changed original answer'));
    expect(history.gameState.score).toBe(3);
    const events = await waitEvent(tracePath(id), 'generation.commit');
    const insertion = events.find(event => event.type === 'action.end' && event.actionType === 'insert');
    expect(insertion.changes.messages.added[0]).toMatchObject({ content: 'transient secret body', ttl: 1, _meta: { visibility: 'llm_only' } });
    expect(insertion.source).toEqual({ file: 'rules.json', pointer: '/0/then/0' });
    expect(events.some(event => event.type === 'resource.read' && event.reference === 'entry')).toBe(true);
    expect(events.find(event => event.type === 'exec.end').result.effects).toEqual({ selected: [1] });
    expect(events.find(event => event.type === 'model.request').messages).toEqual(server.requests[0].messages);
    expect(fs.readFileSync(tracePath(id), 'utf8')).not.toContain('NEVER-LOG-THIS-TRACE-KEY');
    const current = await currentTrace();
    expect(current).toMatchObject({ cardId: id, session: { id: 'default' }, file: tracePath(id) });
    expect(read(current.file)[0]).toMatchObject({ cardId: id, sessionId: current.session.id });
    await expect($('.runtime-trace-control textarea')).not.toExist();
    await expect($('.settings-trace-toggle')).not.toExist();
    await mode(false);
    const before = fs.readFileSync(tracePath(id), 'utf8');
    server.queueOpenAi('second answer');
    await sendMessage('second question');
    await waitForHistory(value => value.messages.some(message => message.content === 'changed second answer'));
    expect(fs.readFileSync(tracePath(id), 'utf8')).toBe(before);
  });

  it('keeps actions before a real Worker timeout and logs rule rollback without sending a model request', async () => {
    const id = 'runtime-trace-timeout';
    await activateCard(card(id, 'Trace Timeout', [{ when: { phase: 'pre_send' }, then: [
      { type: 'state.set', path: 'attempted', value: 'visible before failure' },
      { type: 'exec', source: 'while (true) {}' }
    ] }]));
    await mode(true);
    await sendMessage('trigger');
    const events = await waitEvent(tracePath(id), 'rule.rollback');
    expect(events.find(event => event.type === 'action.end').changes.state)
      .toContainEqual({ path: '/attempted', hasBefore: false, hasAfter: true, after: 'visible before failure' });
    expect(events.find(event => event.type === 'exec.error').error.code).toBe('SCRIPT_TIMEOUT');
    expect(events.find(event => event.type === 'rule.rollback').changes.state)
      .toContainEqual({ path: '/attempted', hasBefore: true, hasAfter: false, before: 'visible before failure' });
    expect(server.requests).toHaveLength(0);
    await expect($('.chat-history')).toHaveText(expect.stringContaining('Script execution timed out'));
    await mode(false);
  });

  it('starts init tracing in a new session and closes the previous session capture', async () => {
    const id = 'runtime-trace-sessions';
    await activateCard(card(id, 'Trace Sessions', [{ when: { phase: 'init' }, then: [
      { type: 'insert', role: 'assistant', content: 'opening' }
    ] }]));
    await waitForHistory(value => value.messages.some(message => message.content === 'opening'));
    expect(fs.existsSync(tracePath(id))).toBe(false);
    await mode(true);
    await browser.execute(() => document.querySelector('[aria-label="管理聊天会话"]').click());
    await $('[aria-label="新建会话"]').waitForExist();
    await browser.execute(() => document.querySelector('[aria-label="新建会话"]').click());
    await browser.waitUntil(async () => (await invoke('get_chat_history')).traceScope.sessionId !== 'default');
    const scope = (await invoke('get_chat_history')).traceScope;
    await waitEvent(tracePath(id, scope.sessionId), 'action.end');
    const oldEvents = read(tracePath(id));
    const newEvents = read(tracePath(id, scope.sessionId));
    expect(oldEvents.at(-1).type).toBe('capture.end');
    expect(newEvents[0].snapshot.messages).toEqual([]);
    expect(newEvents.some(event => event.kind === 'init' && event.type === 'action.end')).toBe(true);
    expect(newEvents.every(event => event.sessionId === scope.sessionId)).toBe(true);
    const current = await currentTrace();
    expect(current).toMatchObject({ cardId: id, session: { id: scope.sessionId, title: '新会话' }, file: tracePath(id, scope.sessionId) });
    await invoke('rename_chat_session', { id: scope.sessionId, title: '问题复现' });
    const renamed = await currentTrace();
    expect(renamed.file).toBe(current.file);
    expect(renamed.session.title).toBe('问题复现');
    expect(read(renamed.file).every(event => event.sessionId === scope.sessionId)).toBe(true);
    await mode(false);
  });

  for (const theme of ['light', 'dark']) {
    it(`uses title-bar themed controls and accessible hit targets in ${theme} mode`, async () => {
      await browser.execute(value => document.documentElement.setAttribute('data-theme', value), theme);
      await mode(true);
      await browser.execute(async () => {
        const button = document.querySelector('.runtime-trace-toggle');
        getComputedStyle(button).color;
        await Promise.all(button.getAnimations({ subtree: true }).map(animation => animation.finished));
      });
      const style = await browser.execute(() => {
        const button = document.querySelector('.runtime-trace-toggle');
        const css = getComputedStyle(button), icon = getComputedStyle(button.querySelector('.material-icons'));
        const palette = document.createElement('span');
        palette.style.color = 'var(--md-on-primary-container)';
        document.body.append(palette);
        const expected = getComputedStyle(palette).color;
        palette.remove();
        return { color: css.color, expected, iconColor: icon.color, width: button.offsetWidth, height: button.offsetHeight,
          statusClip: getComputedStyle(button.querySelector('[role="status"]')).clipPath };
      });
      expect(style.color).toBe(style.expected);
      expect(style.iconColor).toBe(style.color);
      expect(style.width).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeGreaterThanOrEqual(44);
      expect(style.width).toBe(44);
      expect(style.statusClip).toBe('inset(50%)');
      await browser.saveScreenshot(path.resolve(`test-results/tauri-e2e/runtime-trace-${theme}.png`));
      await mode(false);
    });
  }

  it('keeps incomplete-log failures visible when the title bar is no longer hovered', async () => {
    const id = 'runtime-trace-corrupt';
    await activateCard(card(id, 'Trace Corrupt', []));
    await mode(true);
    await mode(false);
    fs.appendFileSync(tracePath(id), '{truncated');
    const before = fs.readFileSync(tracePath(id), 'utf8');
    await $('.runtime-trace-toggle').click();
    await $('.runtime-trace-error').waitForDisplayed();
    await $('.chat-history').moveTo();
    await expect($('.runtime-trace-error')).toBeDisplayed();
    await expect($('.runtime-trace-error')).toHaveText(expect.stringContaining('运行日志不完整'));
    await expect($('.runtime-trace-toggle')).toHaveAttribute('data-state', 'error');
    await expect($('.runtime-trace-toggle')).toHaveAttribute('title', expect.stringContaining('日志不完整'));
    expect(await $('.chat-history').getAttribute('data-view')).toBe('messages');
    expect(fs.readFileSync(tracePath(id), 'utf8')).toBe(before);
    await mode(false);
    await expect($('.runtime-trace-error')).not.toExist();
  });
});
