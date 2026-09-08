const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { convertTavernCard } = require('../../src/shared/tavern-import/convert.js');

test('minified production Worker emits exactly the same executable card scripts', () => {
  const compiled = buildSync({ entryPoints: [path.resolve(__dirname, '../../src/renderer/gameCard/tavernCompiler.worker.js')],
    bundle: true, minify: true, write: false, platform: 'browser', target: 'safari15' });
  let output;
  const context = { self: { postMessage: value => { output = value; } } };
  vm.runInNewContext(compiled.outputFiles[0].text, context, { timeout: 1000 });
  const input = { id: 'minified', source: { spec: 'chara_card_v2', spec_version: '2.0', data: {
    name: 'Alice', first_mes: '{{setvar::score::1}}{{incvar::score}} {{char}} {{pick::one::two}}',
    description: '{{user}} {{getvar::score}}', character_book: { entries: [{ id: 1, keys: ['{{user}}'], content: 'Hello {{char}}' }] },
    extensions: { regex_scripts: [{ placement: [2], promptOnly: true, findRegex: '/({{user}})/g',
      replaceString: '{{char}}:$1', substituteRegex: 2 }] }
  } } };
  context.self.onmessage({ data: input });
  expect(output.error).toBeUndefined();
  expect(output.result.files).toEqual(convertTavernCard(input).files);
  const ctx = { state: { __tavern: { character: 'Alice', user: 'A.B' } },
    messages: [{ role: 'assistant', content: 'A.B A-B' }] };
  const files = output.result.files;
  vm.runInNewContext(`${files['scripts/helpers.js']}\n${files['scripts/regex.js']}\ntavernApplyRegex(ctx,'pre_send');`, { ctx }, { timeout: 1000 });
  expect(ctx.messages[0].content).toBe('Alice:A.B A-B');
});
