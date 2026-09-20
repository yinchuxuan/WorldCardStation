function Root({ React, state, emit }) {
  return React.createElement('div', { style: { position: 'fixed', top: 90, left: 10, pointerEvents: 'auto' } },
    React.createElement('output', { id: 'test-state' }, `count=${state.count};score=${state.score}`),
    React.createElement('button', { id: 'test-increment', onClick: () => emit({ type: 'game.state.apply',
      action: { type: 'state.inc', path: 'count', value: 1 } }) }, '增加计数'),
    React.createElement('button', { id: 'test-script', onClick: () => emit({ type: 'game.script.run', name: 'pick' }) }, '执行脚本'));
}
/* eslint no-unused-vars: off -- This component is loaded by the game-card runtime. */
