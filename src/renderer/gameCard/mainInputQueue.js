// Session-local FIFO. Failed rounds retain pending work until explicit stop/retry.
export function createMainInputQueue({ cancel, notify }) {
  const pending = [];
  let active, paused = false, resetting = false, epoch = 0;
  const discarded = () => Object.assign(new Error('pending input cancelled'), { code: 'INPUT_DISCARDED' });
  function pump() {
    if (active || paused || resetting || !pending.length) return;
    const job = pending.shift(), token = epoch;
    active = job;
    const finish = (value, error) => {
      if (error && epoch === token) paused = true;
      if (active === job) active = undefined;
      notify();
      pump();
      if (error) job.reject(error); else job.resolve(value);
    };
    job.done = Promise.resolve().then(() => {
      if (token !== epoch) throw discarded();
      return job.task();
    }).then(value => finish(value), error => finish(undefined, error));
    notify();
  }
  function enqueue(task) {
    if (resetting || paused) return Promise.reject(new Error('input queue paused; retry or stop first'));
    const result = new Promise((resolve, reject) => pending.push({ task, resolve, reject }));
    result.catch(() => {});
    pump();
    notify();
    return result;
  }
  async function reset(task) {
    const token = ++epoch;
    resetting = true;
    pending.splice(0).forEach(job => job.reject(discarded()));
    const previous = active;
    await cancel();
    await previous?.done;
    if (token !== epoch) throw discarded();
    paused = false; resetting = false;
    if (task) return enqueue(task);
    notify();
  }
  return { enqueue, reset,
    get running() { return Boolean(active || resetting); },
    get busy() { return Boolean(active || resetting || pending.length); },
    get paused() { return paused; },
    get pendingCount() { return pending.length; }
  };
}
