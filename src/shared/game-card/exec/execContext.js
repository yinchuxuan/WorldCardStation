import { cloneJson, deepFreeze } from '../utils/jsonValue.js';

function fallbackUuid(random) {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function createUtils(options = {}) {
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const randomUuid = typeof options.randomUuid === 'function'
    ? options.randomUuid
    : () => fallbackUuid(random);
  return deepFreeze({
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    randomInt: (min, max) => Math.floor(random() * (max - min + 1)) + min,
    roll: (dice) => {
      const match = String(dice).match(/^(\d*)d(\d+)$/i);
      if (!match) throw new Error('invalid dice expression');
      const count = Number(match[1] || 1);
      const sides = Number(match[2]);
      return Array.from({ length: count }).reduce((sum) => sum + Math.floor(random() * sides) + 1, 0);
    },
    uuid: randomUuid
  });
}

function createConfig(card = {}) {
  const config = cloneJson(card);
  delete config.rules;
  delete config.state;
  return deepFreeze(config);
}

function createExecContext({ messages, state, card, event, args, files, random, randomUuid }) {
  return {
    messages: cloneJson(messages),
    state: cloneJson(state),
    config: createConfig(card),
    event: deepFreeze(cloneJson(event || {})),
    args: deepFreeze(cloneJson(args || {})),
    files,
    utils: createUtils({ random, randomUuid })
  };
}

export { createExecContext };
