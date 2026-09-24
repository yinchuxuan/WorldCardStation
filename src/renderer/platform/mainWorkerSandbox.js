// This mutates only a disposable Worker realm, never the renderer or the Node test realm.
function lockMainWorker(global) {
  const safe = new Set(('undefined NaN Infinity Object Array String Number Boolean BigInt Symbol Math JSON '
    + 'Date RegExp Error EvalError RangeError ReferenceError SyntaxError TypeError URIError AggregateError '
    + 'Promise Map Set WeakMap WeakSet ArrayBuffer DataView Uint8Array Uint8ClampedArray Int8Array '
    + 'Uint16Array Int16Array Uint32Array Int32Array Float32Array Float64Array BigInt64Array BigUint64Array '
    + 'parseInt parseFloat isNaN isFinite encodeURI decodeURI encodeURIComponent decodeURIComponent '
    + 'AbortController AbortSignal').split(' '));
  const functionPrototypes = [Function.prototype, Object.getPrototypeOf(async function () {}),
    Object.getPrototypeOf(function* () {}), Object.getPrototypeOf(async function* () {})];
  for (const prototype of functionPrototypes) {
    Object.defineProperty(prototype, 'constructor', { value: undefined, configurable: false, writable: false });
  }
  const frozen = new Set();
  function freeze(value) {
    if (!value || !['object', 'function'].includes(typeof value) || frozen.has(value)) return;
    frozen.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      freeze(descriptor.value); freeze(descriptor.get); freeze(descriptor.set);
    }
    freeze(Object.getPrototypeOf(value));
    Object.freeze(value);
  }
  for (const name of safe) freeze(global[name]);
  functionPrototypes.forEach(freeze);
  // Iterator prototypes are reachable from literals even without a global constructor.
  [[][Symbol.iterator](), ''[Symbol.iterator](), (function* () {})(), (async function* () {})()]
    .forEach(value => freeze(Object.getPrototypeOf(value)));
  const names = new Set();
  for (let object = global; object; object = Object.getPrototypeOf(object)) {
    Object.getOwnPropertyNames(object).forEach(name => names.add(name));
  }
  for (const name of names) {
    if (safe.has(name)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(global, name);
    if (descriptor && !descriptor.configurable && !descriptor.writable) {
      if (global[name] !== undefined) throw new Error(`cannot isolate script global: ${name}`);
      continue;
    }
    Object.defineProperty(global, name, { value: undefined, configurable: false, writable: false });
  }
  for (const name of safe) {
    const descriptor = Object.getOwnPropertyDescriptor(global, name);
    if (descriptor?.configurable) Object.defineProperty(global, name, { ...descriptor, writable: false, configurable: false });
  }
}

export { lockMainWorker };
