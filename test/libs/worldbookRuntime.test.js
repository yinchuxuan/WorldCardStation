const fs = require('node:fs');
const path = require('node:path');
const { user, entry, book, v3Book, runBook, selected, root, scripts } = require('./worldbookTestRuntime');
const { runInBrowser } = require('../../src/renderer/platform/controlledScriptExecutor');
const { scriptWorkerSource } = require('../../src/renderer/platform/scriptWorkerSource');
const { resolveExecSource } = require('../../src/renderer/gameCard/execSource');
const { createExecFiles } = require('../../src/renderer/gameCard/execFiles');

describe('worldbook distribution and sandbox runtime', () => {
  test('a thousand external entries with decorator metadata read only the selected Markdown', async () => {
    const entries = Array.from({ length: 1000 }, (_, index) => entry(String(index), {
      keys: [index === 999 ? 'rare' : `absent-${index}`],
      extensions: { world_card_station: { content_file: `entries/条目-${index}.md`, decorators: [] } }
    }));
    const result = await runBook(v3Book(entries), {
      messages: [user('rare')], files: { 'worldbook/entries/条目-999.md': 'selected body' }
    });
    expect(result.trace.errors).toEqual([]);
    expect(selected(result)).toEqual(['999']);
    expect(result.readText.mock.calls).toEqual([['worldbook/config.json'], ['worldbook/entries/条目-999.md']]);
  });

  test.each([
    [book([entry('duplicate'), entry('duplicate')]), 'duplicate'],
    [{ entries: ['invalid'] }, 'invalid worldbook entry'],
    [{ spec: 'lorebook_v3', data: null }, 'worldbook data'],
    [book([], { extensions: { world_card_station: { format: 'unknown' } } }), 'unknown worldbook format']
  ])('reports invalid configuration without mutating state', async (config, error) => {
    const result = await runBook(config, { state: { existing: 1 } });
    expect(result.trace.errors[0]).toContain(error);
    expect(result.state).toEqual({ existing: 1 });
    expect(result.messages).toEqual([user('key')]);
  });

  test('parse and file failures leave both messages and timer state untouched', async () => {
    const state = { existing: 1 };
    const malformed = await runBook(book([]), { state, files: { 'worldbook/config.json': '{' } });
    expect(malformed.trace.errors[0]).toContain('invalid worldbook config');
    const missing = await runBook(book([entry('ok', { sticky: 3 }), entry('missing', {
      extensions: { world_card_station: { content_file: 'entries/missing.md' } }
    })]), { state });
    expect(missing.trace.errors[0]).toContain('missing test file');
    expect(missing.state).toEqual(state);
    expect(missing.messages).toEqual([user('key')]);
  });

  test('does not bypass the registered directory capability or overwrite a conflicting state namespace', async () => {
    const result = await runBook(book([entry('unsafe', {
      extensions: { world_card_station: { content_file: '../secret.md' } }
    })]));
    expect(result.trace.errors[0]).toContain('must stay inside its file scope');
    expect(result.readText).toHaveBeenCalledTimes(1);
    const collision = await runBook(book([]), { state: { __worldbook: 'owned by card' } });
    expect(collision.trace.errors[0]).toContain('reserved');
    expect(collision.state.__worldbook).toBe('owned by card');
  });

  test('runs the complete library in the browser Worker file-read bridge', async () => {
    const card = { files: { worldbook: { directory: 'worldbook', include: ['config.json', 'entries/*.md'] } } };
    const config = v3Book([entry('worker', {
      sticky: 3, extensions: { world_card_station: { content_file: 'entries/body.md' } }
    })]);
    const readText = jest.fn(async filePath => filePath.endsWith('config.json') ? JSON.stringify(config) : '@@depth 0\nworker body');
    const context = {
      messages: [user('key')], state: {}, args: { worldbook: 'worldbook' }, config: {}, event: {},
      files: createExecFiles({ card, readText })
    };
    const source = resolveExecSource({ sourceFile: 'lib/worldbook/index.js' }, { card, fileContents: scripts });
    const worker = { terminate: jest.fn() };
    const scope = { postMessage: data => queueMicrotask(() => worker.onmessage({ data })) };
    Function('self', scriptWorkerSource)(scope);
    worker.postMessage = data => queueMicrotask(() => scope.onmessage({ data }));
    const result = await runInBrowser(source, context, { timeoutMs: 50, isSourceFile: true, workerFactory: () => worker });
    expect(result.messages.at(-1)).toMatchObject({ content: 'worker body', ttl: 1 });
    expect(result.state.__worldbook.worldbook.entries.worker.stickyUntil).toBe(4);
    expect(readText.mock.calls).toEqual([['worldbook/config.json'], ['worldbook/entries/body.md']]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  test('the library ships its own documentation', () => {
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain('./SEMANTICS.md');
    expect(fs.readFileSync(path.join(root, 'SEMANTICS.md'), 'utf8')).toContain('SillyTavern');
  });

  test('ships only scripts and documentation', () => {
    expect(fs.readdirSync(root).filter(name => !name.startsWith('.')).sort()).toEqual(['README.md', 'SEMANTICS.md', 'lib']);
  });
});
