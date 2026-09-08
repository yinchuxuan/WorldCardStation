import { convertTavernCard } from '../../src/shared/tavern-import/convert.js';
import { source } from './runtime.js';

const report = data => convertTavernCard({ source: source(data), id: 'test' }).report;

test('defaults, metadata and empty extensions are informational without a blocking warning', () => {
  const result = report({ extensions: { fav: true, talkativeness: 0.5, world: '', regex_scripts: [],
    plugin: {}, depth_prompt: { prompt: '', depth: 4, role: 'system' } } });
  expect(result.length).toBeGreaterThan(0);
  expect(result.every(item => item.severity === 'info')).toBe(true);
  const missing = convertTavernCard({ source: { spec: 'chara_card_v2', data: { name: 'Minimal' } }, id: 'minimal' });
  expect(missing.report.every(item => item.severity === 'info')).toBe(true);
});

test.each([
  ['depth_prompt', { prompt: 'Important instructions', depth: 4 }],
  ['plugin', { script: 'some code' }],
  ['unknownExtension', 'unknown behavior']
])('nonempty unsupported %s produces a located compatibility warning', (key, value) => {
  expect(report({ extensions: { [key]: value } })).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'extensions_archived', severity: 'info' }),
    expect.objectContaining({ code: 'extension_unsupported', severity: 'warning', location: `data.extensions.${key}` })
  ]));
});

test('invalid regex rules receive a specific located warning, not a blanket unsupported extension', () => {
  const result = report({ extensions: { regex_scripts: [{ scriptName: 'test', findRegex: 'x', replaceString: 'y' }] } });
  expect(result).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'regex_invalid', severity: 'warning', location: 'data.extensions.regex_scripts[0]' })
  ]));
  expect(result.some(item => item.code === 'extension_unsupported')).toBe(false);
});

test('missing external worldbooks and unknown macros remain warnings', () => {
  expect(report({ extensions: { world: 'Missing world' }, first_mes: '{{unknown}}' })).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'external_worldbook', severity: 'warning' }),
    expect.objectContaining({ code: 'unsupported_macro', location: 'greeting-0:0', severity: 'warning' })
  ]));
});
