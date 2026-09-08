import {
  applyGameCard as applyCoreGameCard,
  applyGameCardAsync as applyCoreGameCardAsync,
  cloneMessages
} from '../../shared/game-card/engine/engine.js';
import { runExecAction } from './execRunner.js';

function prepareOptions({ dependencies = {}, ...coreOptions }) {
  const execute = dependencies.runExecAction || ((messages, state, action, runtimeOptions) => (
    runExecAction(messages, state, action, {
      ...runtimeOptions,
      scriptExecutor: dependencies.scriptExecutor
    })
  ));
  return {
    ...coreOptions,
    dependencies: { readFile: dependencies.readFile, readText: dependencies.readText, runExecAction: execute }
  };
}

function applyGameCard(options = {}) {
  return applyCoreGameCard(prepareOptions(options));
}

function applyGameCardAsync(options = {}) {
  return applyCoreGameCardAsync(prepareOptions(options));
}

export { applyGameCard, applyGameCardAsync, cloneMessages };
