const fs = require('node:fs');
const path = require('node:path');
const { preparePreSendMessages } = require('../game-card/legacyPipelineHarness.js');
const { createMemoryGameCardPlatform } = require('../../src/renderer/platform/memoryGameCardPlatform');
const { scripts } = require('./worldbookTestRuntime');

const root = path.resolve(__dirname, '../fixtures/worldbook');
const baseCard = JSON.parse(fs.readFileSync(path.join(root, 'card.json'), 'utf8'));
const baseBook = JSON.parse(fs.readFileSync(path.join(root, 'worldbook/config.json'), 'utf8'));
let runtimeId = 0;

function readFiles(directory = root, prefix = '') {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return Object.entries(readFiles(path.join(directory, entry.name), relative));
    return [[relative, fs.readFileSync(path.join(directory, entry.name), 'utf8')]];
  }));
}

function runtime(book = baseBook) {
  runtimeId += 1;
  const card = { ...baseCard, id: `worldbook-test-${runtimeId}` };
  const files = { ...scripts, ...readFiles() };
  files['worldbook/config.json'] = JSON.stringify(book);
  const platform = createMemoryGameCardPlatform({ files: { [card.id]: files } });
  return { card, platform };
}

async function prepare(messages, book) {
  const instance = runtime(book);
  return preparePreSendMessages({ ...instance, messages });
}

function worldbookMessages(result) {
  return result.messages.filter(message => message._meta?.source === 'worldbook:demo');
}

describe('worldbook game-card library', () => {
  test('loads constants, matches keys, and recursively discovers entries', async () => {
    const result = await prepare([{ role: 'user', content: '今晚下雪，我们去车站。' }]);
    const [message] = worldbookMessages(result);

    expect(result.error).toBeUndefined();
    expect(message.content).toContain('故事发生在一座冬季小城');
    expect(message.content).toContain('雪夜车站里');
    expect(message.content).toContain('钢琴家随身带着');
    expect(message.content).not.toContain('海边有一座');
    expect(message.ttl).toBe(1);
    expect(message._meta.visibility).toBe('llm_only');
    expect(result.messages.at(-1).role).toBe('user');
  });

  test('only inserts constant entries when no key matches', async () => {
    const result = await prepare([{ role: 'user', content: '普通的一天。' }]);
    const [message] = worldbookMessages(result);

    expect(message.content).toContain('故事发生在一座冬季小城');
    expect(message.content).not.toContain('雪夜车站里');
  });

  test('scan depth zero does not match conversation messages', async () => {
    const result = await prepare([{ role: 'user', content: '车站正在下雪。' }], {
      ...baseBook, scan_depth: 0,
      entries: baseBook.entries.filter(entry => !entry.constant)
    });

    expect(worldbookMessages(result)).toHaveLength(0);
  });

  test('accepts SillyTavern entry aliases and selective logic', async () => {
    const result = await prepare([{ role: 'user', content: 'Dragon at the red wing snow station.' }], {
      id: 'demo', scanDepth: 2, tokenBudget: 100, entries: {
        10: {
          uid: 10, key: ['Dragon'], keysecondary: ['red', 'wing'], selective: true,
          selectiveLogic: 3, caseSensitive: true, order: 10, content: 'all filters', disable: false
        },
        20: { uid: 20, key: ['/snow\\s+station/i'], order: 20, content: 'regex key' },
        30: {
          uid: 30, key: ['Dragon'], keysecondary: ['forbidden'], selective: true,
          selectiveLogic: 2, order: 30, content: 'not any filter'
        },
        40: { uid: 40, key: ['Dragon'], order: 40, content: 'disabled', disable: true }
      }
    });
    const content = worldbookMessages(result)[0].content;

    expect(content).toBe('all filters\n\nregex key\n\nnot any filter');
  });

  test('applies priority budget deterministically and honors ignoreBudget', async () => {
    const result = await prepare([{ role: 'user', content: 'match' }], {
      id: 'demo', token_budget: 2, entries: [
        { id: 'low', keys: ['match'], content: '12345678', enabled: true, priority: 1 },
        { id: 'high', keys: ['match'], content: 'abcdefgh', enabled: true, priority: 2 },
        { id: 'free', constant: true, content: 'free', enabled: true, ignoreBudget: true }
      ]
    });
    const content = worldbookMessages(result)[0].content;

    expect(content).toContain('abcdefgh');
    expect(content).toContain('free');
    expect(content).not.toContain('12345678');
  });

  test('honors SillyTavern probability controls', async () => {
    const result = await prepare([{ role: 'user', content: 'test' }], {
      id: 'demo', entries: [
        { id: 'blocked', constant: true, content: 'blocked', probability: 0 },
        {
          id: 'ungated', constant: true, content: 'ungated',
          probability: 0, useProbability: false
        }
      ]
    });

    expect(worldbookMessages(result)[0].content).toBe('ungated');
  });

  test('replaces its previous temporary injection on the next send', async () => {
    const first = await prepare([{ role: 'user', content: '车站正在下雪。' }]);
    const second = await prepare([...first.messages, { role: 'user', content: '继续。' }]);

    expect(worldbookMessages(second)).toHaveLength(1);
  });

  test('handles large inline worldbooks without registering each entry', async () => {
    const entries = Array.from({ length: 1000 }, (_, index) => ({
      id: `entry-${index}`,
      keys: [`key-${index}`],
      content: `content-${index}`,
      enabled: true,
      constant: index === 999,
      insertion_order: index
    }));
    const result = await prepare([{ role: 'user', content: 'no match' }], {
      id: 'demo', scan_depth: 2, token_budget: 100, entries
    });

    expect(worldbookMessages(result)[0].content).toBe('content-999');
  });

  test('rejects entry files outside the registered include patterns', async () => {
    const book = {
      ...baseBook,
      entries: [{
        id: 'bad', constant: true, enabled: true,
        extensions: { world_card_station: { content_file: 'outside.md' } }
      }]
    };
    const result = await prepare([{ role: 'user', content: 'test' }], book);

    expect(result.error).toContain('outside scope worldbook');
  });

  test('pre_send preserves session timers while expiring and replacing temporary messages', async () => {
    const instance = runtime({
      id: 'demo', scan_depth: 1, extensions: { world_card_station: { format: 'sillytavern' } },
      entries: [{ id: 'timed', keys: ['key'], content: 'sticky body', sticky: 5 }]
    });
    const first = await preparePreSendMessages({
      ...instance, messages: [{ role: 'user', content: 'key' }], state: { health: 7 }
    });
    const second = await preparePreSendMessages({
      ...instance, state: JSON.parse(JSON.stringify(first.state)),
      messages: [...first.messages, { role: 'assistant', content: 'reply' }, { role: 'user', content: 'now' }]
    });
    expect(second.error).toBeUndefined();
    expect(worldbookMessages(second)).toHaveLength(1);
    expect(worldbookMessages(second)[0].content).toBe('sticky body');
    expect(second.state.health).toBe(7);
    expect(second.state.__worldbook.worldbook.entries.timed.stickyUntil).toBe(6);
  });
});
