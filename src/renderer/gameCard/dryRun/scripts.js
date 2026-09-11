import { extractExecIncludes, normalizeCardPath, resolveExecIncludePath, resolveExecSource } from '../execSource.js';
import { assertBrowserExecSource, compileExecSource } from '../../../shared/game-card/exec/execCompilation.js';
import { createUiRootFactory } from '../../../shared/game-card/exec/uiCompilation.js';

async function loadScript(file, files, stack, ctx, origin) {
  const location = { file, pointer: '', reference: origin };
  if (stack.includes(file) || stack.length > 20) {
    throw new Error(stack.includes(file) ? `circular exec include: ${file}` : 'exec include depth exceeded');
  }
  // Revisited includes still need stack checks, even when file contents are cached.
  const source = await ctx.readText(file);
  files[file] = source;
  await ctx.check('exec_syntax', location, () => {
    assertBrowserExecSource(source);
    compileExecSource(source, true); // Compile only: never call the returned function.
  });
  for (const include of extractExecIncludes(source)) {
    await ctx.check('exec_include', location, async () => {
      await loadScript(resolveExecIncludePath(file, include), files, [...stack, file], ctx, origin);
    });
  }
}

async function checkExec(action, location, ctx) {
  if (typeof action.source === 'string') {
    await ctx.check('exec_syntax', location, () => {
      assertBrowserExecSource(action.source);
      compileExecSource(action.source, false);
    });
    return;
  }
  const files = Object.create(null);
  const before = ctx.diagnostics.length;
  await ctx.check('exec_include', location, () => loadScript(normalizeCardPath(action.sourceFile), files, [], ctx, location));
  if (ctx.diagnostics.length !== before) return;
  await ctx.check('exec_syntax', { file: action.sourceFile, pointer: '', reference: location }, () => {
    const source = resolveExecSource(action, { fileContents: files });
    assertBrowserExecSource(source);
    compileExecSource(source, true);
  });
}

async function checkUiRoot(file, ctx) {
  await ctx.check('ui_syntax', { file, pointer: '' }, async () => {
    createUiRootFactory(await ctx.readText(file)); // No module initialization or React rendering.
  });
}

export { checkExec, checkUiRoot };
