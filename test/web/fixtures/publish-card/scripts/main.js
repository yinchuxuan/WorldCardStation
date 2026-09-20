include('./helper.js');
function run(ctx) { return { messages: ctx.messages, state: { ...ctx.state, count: initialCount() } }; }
/* global include, initialCount */
/* eslint no-unused-vars: off -- run is invoked by the game-card runtime. */
