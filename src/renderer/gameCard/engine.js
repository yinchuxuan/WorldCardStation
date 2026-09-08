import {
  applyGameCard as applyCoreGameCard,
  applyGameCardAsync as applyCoreGameCardAsync,
  cloneMessages
} from '../../shared/game-card/engine/engine.js';
import { runExecAction } from './execRunner.js';
import { createPlatformFileReader } from './platformFileReader.js';

function applyGameCard(options = {}) {
  const {
    contentBaseDir,
    dependencies = {},
    fs,
    path,
    ...coreOptions
  } = options;
  const platformOptions = { baseDir: contentBaseDir, fs, path };
  const readFile = dependencies.readFile || createPlatformFileReader(platformOptions);
  const execute = dependencies.runExecAction || ((messages, state, action, runtimeOptions) => (
    runExecAction(messages, state, action, {
      ...runtimeOptions,
      ...platformOptions,
      scriptExecutor: dependencies.scriptExecutor
    })
  ));

  return applyCoreGameCard({
    ...coreOptions,
    dependencies: { readFile, readText: dependencies.readText, runExecAction: execute }
  });
}

function applyGameCardAsync(options = {}) {
  const { contentBaseDir, dependencies = {}, fs, path, ...coreOptions } = options;
  const platformOptions = { baseDir: contentBaseDir, fs, path };
  const readFile = dependencies.readFile || createPlatformFileReader(platformOptions);
  const execute = dependencies.runExecAction || ((messages, state, action, runtimeOptions) => (
    runExecAction(messages, state, action, {
      ...runtimeOptions,
      ...platformOptions,
      scriptExecutor: dependencies.scriptExecutor
    })
  ));
  return applyCoreGameCardAsync({
    ...coreOptions,
    dependencies: { readFile, readText: dependencies.readText, runExecAction: execute }
  });
}

export { applyGameCard, applyGameCardAsync, cloneMessages };
