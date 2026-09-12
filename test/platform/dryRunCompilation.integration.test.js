const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { transformSync } = require('@babel/core');

function bundle(entry, instrument = false) {
  const filename = path.resolve(__dirname, '../../src', entry);
  const result = buildSync({ entryPoints: [filename],
    bundle: true, minify: true, write: false, platform: 'browser', target: 'safari15',
    format: 'iife', globalName: 'Compiled' });
  const context = {};
  const source = result.outputFiles[0].text;
  const code = instrument ? transformSync(source, { filename, babelrc: false, configFile: false,
    plugins: ['babel-plugin-istanbul'] }).code : source;
  vm.runInNewContext(code, context, { timeout: 1000 });
  return context.Compiled;
}

test.each([false, true])('minified Worker compiler remains self-contained (coverage=%s)', async instrument => {
  const compiled = bundle('renderer/platform/scriptWorkerSource.js', instrument);
  const outputs = [];
  const context = { self: { postMessage: value => outputs.push(value) } };
  vm.runInNewContext(compiled.scriptWorkerSource, context, { timeout: 1000 });
  for (const isSourceFile of [false, true]) {
    await context.self.onmessage({ data: {
      source: isSourceFile ? 'async function run(ctx) { return { state: ctx.state }; }' : 'return { state };',
      isSourceFile, context: { state: { score: 2 } }, files: {}
    } });
  }
  expect(outputs).toEqual([{ result: { state: { score: 2 } } }, { result: { state: { score: 2 } } }]);
});

test('minified checker compiles untrusted code without executing top-level or inline bodies', async () => {
  const { checkCard } = bundle('renderer/gameCard/dryRun/checkCard.js');
  const card = { id: 'minified', name: 'Minified', version: '1', rules: [{ when: { phase: 'init' }, then: [
    { type: 'exec', sourceFile: 'main.js' },
    { type: 'exec', source: 'throw new Error("EXECUTED"); while (true) {}' }
  ] }] };
  const result = await checkCard(card, async () => 'throw new Error("EXECUTED"); while(true) {}\nfunction run() {}');
  expect(result.diagnostics).toEqual([]);
  expect(result.checked).toContain('javascript_syntax');
});
