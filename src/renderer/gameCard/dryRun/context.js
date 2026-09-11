function pointer(parent, key) {
  return `${parent}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function createCheckContext(card, readText) {
  const diagnostics = [];
  const warnings = [];
  const cache = new Map();
  return {
    card, diagnostics, warnings,
    readText(file) {
      if (!cache.has(file)) cache.set(file, Promise.resolve().then(() => readText(file)));
      return cache.get(file);
    },
    async check(code, location, fn) {
      try { return await fn(); } catch (error) {
        diagnostics.push({ code, message: error.message || String(error), ...location });
        return undefined;
      }
    },
    warn(code, message, location) { warnings.push({ code, message, ...location }); }
  };
}

export { pointer, createCheckContext };
