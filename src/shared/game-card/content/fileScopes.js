const TEXT_EXTENSION_PATTERN = /\.(md|txt|json)$/i;

function isDirectoryScope(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.directory === 'string' && Array.isArray(value.include);
}

function requireSafeRelativePath(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/')) {
    throw new Error(`${label} must be a safe relative path`);
  }
  if (value.split('/').some(part => !part || part === '..')) {
    throw new Error(`${label} must stay inside its file scope`);
  }
  return value;
}

function globPattern(pattern) {
  const escaped = pattern
    .split('*')
    .map(part => part.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${escaped}$`);
}

function matchesScope(scope, relativePath) {
  return scope.include.some(pattern => globPattern(pattern).test(relativePath));
}

function resolveScopedTextPath(card, scopeId, relativePath) {
  const scope = card?.files?.[scopeId];
  if (!isDirectoryScope(scope)) throw new Error(`unknown text file scope: ${scopeId}`);
  const safePath = requireSafeRelativePath(relativePath, 'scoped text path');
  if (!TEXT_EXTENSION_PATTERN.test(safePath) || !matchesScope(scope, safePath)) {
    throw new Error(`text file is outside scope ${scopeId}: ${safePath}`);
  }
  const directory = requireSafeRelativePath(scope.directory, 'text scope directory');
  return `${directory}/${safePath}`;
}

function resolveRegisteredTextPath(card, fileRef) {
  if (typeof fileRef !== 'string') return null;
  const exact = card?.files?.[fileRef];
  if (typeof exact === 'string') return exact;
  const separator = fileRef.indexOf('/');
  if (separator < 1) return null;
  const scopeId = fileRef.slice(0, separator);
  if (!isDirectoryScope(card?.files?.[scopeId])) return null;
  return resolveScopedTextPath(card, scopeId, fileRef.slice(separator + 1));
}

export { isDirectoryScope, requireSafeRelativePath, resolveRegisteredTextPath, resolveScopedTextPath };
