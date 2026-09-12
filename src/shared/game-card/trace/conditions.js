function childObserver(observer, path) {
  return observer ? detail => observer({ ...detail, path: `${path}${detail.path || ''}` }) : undefined;
}

function evaluateConditions(entries, evaluate, observer, { some = false, actual } = {}) {
  if (!observer) return some ? entries.some(evaluate) : entries.every(evaluate);
  let result = !some, stopped = false;
  for (const [index, entry] of entries.entries()) {
    const [key, expected] = entry;
    const path = `/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (stopped) {
      observer({ path, expected, status: 'not_evaluated', reason: 'short_circuit' });
      continue;
    }
    const value = evaluate(entry, index);
    observer({ path, expected, ...(actual ? { actual: actual(entry) } : {}), status: 'evaluated', result: value });
    if (some ? value : !value) { result = value; stopped = true; }
  }
  return result;
}

export { childObserver, evaluateConditions };
