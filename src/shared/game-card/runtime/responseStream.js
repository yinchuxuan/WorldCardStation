// Producer runs independently of the single reader, including hidden calls.
function createResponseStream() {
  const chunks = [];
  let ended = false;
  let failure;
  let wake;
  let subscribed = false;
  const notify = () => { wake?.(); wake = undefined; };
  return {
    push(text) {
      if (ended) return;
      if (typeof text !== 'string') throw new Error('model content must be text');
      chunks.push(text);
      notify();
    },
    finish(error) { if (ended) return; ended = true; failure = error; notify(); },
    response: Object.freeze({
      [Symbol.asyncIterator]() {
        if (subscribed) throw new Error('response allows only one consumer');
        subscribed = true;
        return (async function* () {
          let index = 0;
          while (true) {
            while (index < chunks.length) yield chunks[index++];
            if (ended) {
              if (failure) throw failure;
              return;
            }
            await new Promise(resolve => { wake = resolve; });
          }
        })();
      }
    })
  };
}

export { createResponseStream };
