import { createReader } from '../../src/shared/game-card/runtime/reader.js';
import { barrier } from './agentRuntimeHelpers.js';

const patch = '<state_patch_stream>{"count":1}</state_patch_stream>';
async function* chunks(text) { for (const char of text) yield char; }
async function collect(reader) {
  const result = [];
  for (let item = await reader.next(); !item.done; item = await reader.next()) result.push(item.value);
  return result;
}
test.each(['static', 'stream'])('%s × segmented: exact boundaries, no precommit, trailing patches', async sourceType => {
  const text = `first\r\n\r\nsecond${patch}${patch}third\n\n${patch}`;
  const applyPatch = jest.fn();
  const { reader } = createReader({ source: sourceType === 'static' ? text : chunks(text), mode: 'segmented', applyPatch });
  expect(applyPatch).not.toHaveBeenCalled();
  expect((await reader.next()).value).toEqual({ text: 'first', patches: [] });
  expect((await reader.next()).value).toEqual({ text: 'second', patches: [] });
  expect(applyPatch).not.toHaveBeenCalled();
  expect((await reader.next()).value).toEqual({ text: 'third', patches: ['{"count":1}', '{"count":1}'] });
  expect(applyPatch).toHaveBeenCalledTimes(2);
  expect((await reader.next()).value).toEqual({ text: '', patches: ['{"count":1}'] });
  expect(await reader.next()).toEqual({ done: true, value: undefined });
  expect(await reader.next()).toEqual({ done: true, value: undefined });
  expect(applyPatch).toHaveBeenCalledTimes(3);
});
test.each(['static', 'stream'])('%s × continuous strips both tags without parsing JSON', async sourceType => {
  const text = `a\r\nb<state_patch>not json</state_patch>${patch}<state_patch_stream>invalid</state_patch_stream>c`;
  const applyPatch = jest.fn();
  const { reader } = createReader({ source: sourceType === 'static' ? text : chunks(text), mode: 'continuous', applyPatch });
  const result = await collect(reader);
  expect(result.map(item => item.text).join('')).toBe('a\nbc');
  expect(result.every(item => item.patches.length === 0)).toBe(true);
  expect(applyPatch).not.toHaveBeenCalled();
});
test('literal separator, empty paragraphs, CR split across chunks and ignored ordinary JSON', async () => {
  const { reader } = createReader({ source: chunks('a\r\nb\r<state_patch>invalid</state_patch>\rc'),
    mode: 'segmented', separator: '\r\n', applyPatch: jest.fn() });
  expect((await collect(reader)).map(unit => unit.text)).toEqual(['a', 'b', 'c']);
  const other = createReader({ source: 'x.*y.*.*z', mode: 'segmented', separator: '.*' });
  expect((await collect(other.reader)).map(unit => unit.text)).toEqual(['x', 'y', 'z']);
  const plain = createReader({ source: chunks('normal <tag>text</tag> <'), mode: 'continuous' });
  expect((await collect(plain.reader)).map(unit => unit.text).join('')).toBe('normal <tag>text</tag> <');
});
test.each(['<state_patch>missing', '<state_patch_stream', '</state_patch>',
  '<state_patch><state_patch_stream>x</state_patch_stream></state_patch>', '<state_patch>x</state_patch_stream>'])('malformed control stream fails: %s', async text => {
  const { reader } = createReader({ source: chunks(text), mode: 'continuous' });
  await expect(collect(reader)).rejects.toThrow(/state patch/);
});
test('every split position protects both opening and closing tags', async () => {
  const text = `a${patch}<state_patch>{}</state_patch>b`;
  for (let split = 1; split < text.length; split++) {
    const source = async function* () { yield text.slice(0, split); yield text.slice(split); };
    const { reader } = createReader({ source: source(), mode: 'continuous' });
    expect((await collect(reader)).map(unit => unit.text).join('')).toBe('ab');
  }
});
test('continuous yields before EOF; segmented waits for a boundary, not transport chunks', async () => {
  const gate = barrier();
  async function* source() { yield 'early'; await gate.promise; yield '\n\nlate'; }
  const continuous = createReader({ source: source(), mode: 'continuous' });
  expect((await continuous.reader.next()).value.text).toBe('early');
  const segmented = createReader({ source: source(), mode: 'segmented' });
  let resolved = false;
  const next = segmented.reader.next().then(value => { resolved = true; return value; });
  await Promise.resolve();
  expect(resolved).toBe(false);
  gate.resolve();
  expect((await next).value.text).toBe('early');
  expect((await collect(segmented.reader)).map(unit => unit.text)).toEqual(['late']);
  await collect(continuous.reader);
});
test('source, mode, chunks, concurrent next, cancellation and patch errors are enforced', async () => {
  expect(() => createReader({ source: {}, mode: 'continuous' })).toThrow('source');
  expect(() => createReader({ source: '', mode: 'other' })).toThrow('mode');
  async function* invalid() { yield 1; }
  await expect(createReader({ source: invalid(), mode: 'continuous' }).reader.next()).rejects.toThrow('strings');
  const gate = barrier(); let cancelled = false;
  async function* source() { await gate.promise; yield 'x'; }
  const { reader } = createReader({ source: source(), mode: 'continuous', check: () => { if (cancelled) throw new Error('cancelled'); } });
  const first = reader.next();
  await expect(reader.next()).rejects.toThrow('concurrent');
  cancelled = true; gate.resolve();
  await expect(first).rejects.toThrow('cancelled');
  const fail = createReader({ source: patch, mode: 'segmented', applyPatch: () => { throw new Error('denied'); } });
  await expect(fail.reader.next()).rejects.toThrow('denied');
  await expect(fail.reader.next()).rejects.toThrow('denied');
});
