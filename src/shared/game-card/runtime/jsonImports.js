import { requireSafeRelativePath } from '../content/fileScopes.js';

const pointer = (base, key) => `${base}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
const isImport = value => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).length === 1 && typeof value.$import === 'string';

// Paths are card-root relative, including imports inside Agent files.
async function readExpandedJson(readText, file) {
  const sources = {};
  async function read(path, stack, target) {
    requireSafeRelativePath(path, 'JSON import');
    if (!path.endsWith('.json')) throw new Error(`${path}: JSON import must reference .json`);
    if (stack.includes(path) || stack.length >= 20) throw new Error(`${path}: circular/deep JSON import`);
    let value;
    try { value = JSON.parse(await readText(path)); }
    catch (error) { throw new Error(`${path}: ${error.message}`); }
    return expand(value, path, '', target, [...stack, path]);
  }
  async function expand(value, source, location, target, stack) {
    if (isImport(value)) return read(value.$import, stack, target);
    sources[target] = { file: source, pointer: location };
    if (Array.isArray(value)) {
      const result = [];
      for (const [index, item] of value.entries()) {
        const base = pointer(target, result.length);
        const child = await expand(item, source, pointer(location, index), base, stack);
        if (isImport(item) && Array.isArray(child)) {
          const moved = Object.entries(sources).filter(([key]) => key.startsWith(`${base}/`));
          delete sources[base];
          moved.forEach(([key]) => delete sources[key]);
          for (const [key, entry] of moved) {
            const suffix = key.slice(base.length + 1), slash = suffix.indexOf('/');
            const index = Number(slash < 0 ? suffix : suffix.slice(0, slash));
            sources[`${pointer(target, result.length + index)}${slash < 0 ? '' : suffix.slice(slash)}`] = entry;
          }
          result.push(...child);
        } else result.push(child);
      }
      return result;
    }
    if (!value || typeof value !== 'object') return value;
    const entries = [];
    for (const [key, child] of Object.entries(value)) {
      entries.push([key, await expand(child, source, pointer(location, key), pointer(target, key), stack)]);
    }
    return Object.fromEntries(entries);
  }
  return { value: await read(file, [], ''), sources };
}

export { readExpandedJson };
